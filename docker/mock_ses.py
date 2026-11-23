"""Mock of AWS SES for local development, with an inbox page.

The cloud API sends its emails through boto3. With SES_ENDPOINT_URL pointing here
they land in this inbox instead of going out, so login links can be clicked
without a mail server.

  GET  /            inbox, with a quick login for the users of dev-data.json
  GET  /messages    the same messages as JSON
  GET  /dev-login   asks the API for a login email for a dev user and redirects to its link
  POST /            the SES API (only SendEmail)
  POST /clear       empties the inbox

Messages are kept in memory only.
"""
import html
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("MOCK_SES_PORT", "8025"))
CLOUD_API_URL = os.environ.get("CLOUD_API_URL", "http://cloud-api:8000").rstrip("/")
DEV_DATA_PATH = os.environ.get("DEV_DATA", "/app/dev-data.json")
MAX_MESSAGES = 200
URL_PATTERN = re.compile(r"https?://[^\s<>\"']+")

messages: list[dict] = []
lock = threading.Lock()


def dev_users() -> list[dict]:
    try:
        with open(DEV_DATA_PATH, encoding="utf-8") as handle:
            return json.load(handle)["residents"]
    except (OSError, ValueError, KeyError):
        return []


def ses_response(action: str, body: str) -> str:
    request_id = str(uuid.uuid4())
    return (
        f'<{action}Response xmlns="http://ses.amazonaws.com/doc/2010-12-01/">{body}'
        f"<ResponseMetadata><RequestId>{request_id}</RequestId></ResponseMetadata></{action}Response>"
    )


def ses_error(code: str, message: str) -> str:
    return (
        '<ErrorResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/"><Error><Type>Sender</Type>'
        f"<Code>{code}</Code><Message>{html.escape(message)}</Message></Error>"
        f"<RequestId>{uuid.uuid4()}</RequestId></ErrorResponse>"
    )


def handle_ses(form: dict[str, list[str]]) -> tuple[int, str]:
    action = form.get("Action", [""])[0]
    if action != "SendEmail":
        return 400, ses_error("InvalidAction", f"The mock only supports SendEmail, got '{action}'")

    recipients = [
        values[0] for key, values in sorted(form.items()) if key.startswith("Destination.ToAddresses.member.")
    ]
    message = {
        "id": str(uuid.uuid4()),
        "received": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "from": form.get("Source", [""])[0],
        "to": recipients,
        "subject": form.get("Message.Subject.Data", [""])[0],
        "body": form.get("Message.Body.Text.Data", [""])[0],
        "html": form.get("Message.Body.Html.Data", [""])[0],
    }
    with lock:
        messages.append(message)
        del messages[:-MAX_MESSAGES]
    print(f"Mail for {', '.join(recipients)}: {message['subject']}", flush=True)
    return 200, ses_response("SendEmail", f"<SendEmailResult><MessageId>{message['id']}</MessageId></SendEmailResult>")


def first_link(text: str) -> str | None:
    match = URL_PATTERN.search(text)
    return match.group(0) if match else None


def render_inbox() -> str:
    with lock:
        shown = list(reversed(messages))

    rows = []
    for user in dev_users():
        email = urllib.parse.quote(user["email"])
        rows.append(
            "<tr>"
            f"<td>{html.escape(user['full_name'])}</td><td>{html.escape(user['email'])}</td>"
            f'<td><a class="btn" href="/dev-login?email={email}&flow=resident">Resident portal</a> '
            f'<a class="btn" href="/dev-login?email={email}&flow=management">Management portal</a></td>'
            "</tr>"
        )
    users_table = (
        "<table><tr><th>User</th><th>Email</th><th>Log in as</th></tr>" + "".join(rows) + "</table>"
        if rows
        else "<p>No users found in dev-data.json.</p>"
    )

    cards = []
    for message in shown:
        if message.get("html"):
            # The HTML version, like a mail client shows it. The text version stays one click away.
            body = (
                f'<iframe class="preview" sandbox srcdoc="{html.escape(message["html"], quote=True)}"></iframe>'
                "<details><summary>Plain text version</summary><pre>"
                + URL_PATTERN.sub(
                    lambda found: f'<a href="{found.group(0)}">{found.group(0)}</a>',
                    html.escape(message["body"].strip()),
                )
                + "</pre></details>"
            )
        else:
            body = "<pre>" + URL_PATTERN.sub(
                lambda found: f'<a href="{found.group(0)}">{found.group(0)}</a>', html.escape(message["body"].strip())
            ) + "</pre>"
        cards.append(
            '<div class="mail">'
            f"<h3>{html.escape(message['subject'])}</h3>"
            f'<div class="meta">To: {html.escape(", ".join(message["to"]))} &middot; '
            f'From: {html.escape(message["from"])} &middot; {message["received"]}</div>'
            f"{body}</div>"
        )
    inbox = "".join(cards) or "<p>No mail yet. Request a login link in one of the portals.</p>"

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Mock mail inbox</title>
<meta http-equiv="refresh" content="10">
<style>
 body {{ font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #222; }}
 table {{ border-collapse: collapse; width: 100%; }}
 th, td {{ text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #ddd; }}
 .btn {{ display: inline-block; padding: .25rem .6rem; border: 1px solid #1677ff; border-radius: 4px;
         color: #1677ff; text-decoration: none; font-size: .9rem; }}
 .btn:hover {{ background: #1677ff; color: #fff; }}
 .mail {{ border: 1px solid #ddd; border-radius: 6px; padding: .6rem 1rem; margin: 1rem 0; }}
 .mail h3 {{ margin: 0 0 .2rem; }}
 .meta {{ color: #666; font-size: .85rem; }}
 pre {{ white-space: pre-wrap; font-family: inherit; }}
 .preview {{ width: 100%; height: 520px; border: 1px solid #ddd; border-radius: 6px; margin-top: .6rem; }}
 summary {{ cursor: pointer; color: #666; font-size: .85rem; margin-top: .4rem; }}
 form {{ display: inline; }}
</style></head><body>
<h1>Mock mail inbox</h1>
<p>Emails of the local stack end up here instead of being sent. This page refreshes every 10 seconds.</p>
<h2>Quick login</h2>
<p>Asks the API for a real login email and follows the link in it.</p>
{users_table}
<h2>Inbox ({len(shown)}) <form method="post" action="/clear"><button type="submit">Clear</button></form></h2>
{inbox}
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def send(self, status: int, content_type: str, body: str, headers: dict[str, str] | None = None) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        if parsed.path == "/":
            self.send(200, "text/html; charset=utf-8", render_inbox())
        elif parsed.path == "/messages":
            with lock:
                self.send(200, "application/json", json.dumps(messages, indent=2))
        elif parsed.path == "/health":
            self.send(200, "text/plain", "ok")
        elif parsed.path == "/dev-login":
            self.dev_login(query)
        else:
            self.send(404, "text/plain", "not found")

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            status, body = handle_ses(urllib.parse.parse_qs(raw, keep_blank_values=True))
            self.send(status, "text/xml", body)
        elif path == "/clear":
            with lock:
                messages.clear()
            self.send(303, "text/plain", "", {"Location": "/"})
        else:
            self.send(404, "text/plain", "not found")

    def dev_login(self, query: dict[str, list[str]]) -> None:
        email = query.get("email", [""])[0]
        flow = query.get("flow", ["resident"])[0]
        if email not in {user["email"] for user in dev_users()} or flow not in ("resident", "management"):
            self.send(400, "text/plain", "Only the users of dev-data.json can use the quick login.")
            return

        with lock:
            already = len(messages)
        url = f"{CLOUD_API_URL}/auth/request-access?" + urllib.parse.urlencode({"email": email, "flow": flow})
        try:
            urllib.request.urlopen(urllib.request.Request(url, method="POST"), timeout=15).read()
        except (urllib.error.URLError, OSError) as error:
            self.send(502, "text/plain", f"The API did not accept the login request: {error}")
            return

        deadline = time.time() + 10
        while time.time() < deadline:
            with lock:
                fresh = [message for message in messages[already:] if email in message["to"]]
            link = first_link(fresh[-1]["body"]) if fresh else None
            if link:
                self.send(302, "text/plain", "", {"Location": link})
                return
            time.sleep(0.2)
        self.send(504, "text/plain", "No login email arrived within 10 seconds. Check the API logs.")


if __name__ == "__main__":
    print(f"Mock SES listening on port {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
