"""The look of the emails: the same colours, font and rounded cards as the resident and management portals.

Mail clients are far more limited than browsers, so the HTML uses tables and inline styles, with a plain text
version next to it for clients that do not show HTML.
"""
from html import escape

PRODUCT_NAME = "Charger"

# The palette of the portals (see theme/ThemeProvider.tsx in both UIs).
PRIMARY = "#0d9488"
PRIMARY_END = "#22c55e"
FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

TEXT = "#0f172a"
TEXT_SECONDARY = "#64748b"
PAGE_BG = "#f3f5f7"
CARD_BG = "#ffffff"
BORDER = "#e2e8f0"
PRIMARY_BG = "#e2f5f2"

DARK_TEXT = "#f1f5f9"
DARK_TEXT_SECONDARY = "#94a3b8"
DARK_PAGE_BG = "#0b0d10"
DARK_CARD_BG = "#14161a"
DARK_BORDER = "#262a30"
DARK_PRIMARY_BG = "#10302d"


def render_action_email(
    *,
    portal: str,
    heading: str,
    paragraphs: list[str],
    button_label: str,
    link: str,
    note: str,
) -> tuple[str, str]:
    """An email with one call to action. Returns the plain text and the HTML version."""
    return (
        _plain_text(portal, heading, paragraphs, button_label, link, note),
        _html(portal, heading, paragraphs, button_label, link, note),
    )


def _plain_text(portal: str, heading: str, paragraphs: list[str], button_label: str, link: str, note: str) -> str:
    lines = [f"{PRODUCT_NAME} | {portal}", "", heading, ""]
    for paragraph in paragraphs:
        lines += [paragraph, ""]
    lines += [f"{button_label}:", link, "", note, "", "If you did not expect this email, you can ignore it."]
    return "\n".join(lines) + "\n"


def _html(portal: str, heading: str, paragraphs: list[str], button_label: str, link: str, note: str) -> str:
    safe_link = escape(link, quote=True)
    body = "".join(
        f'<p class="text" style="margin:0 0 16px;font-size:15px;line-height:24px;color:{TEXT};">{escape(paragraph)}</p>'
        for paragraph in paragraphs
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{escape(heading)}</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .page {{ background-color: {DARK_PAGE_BG} !important; }}
    .card {{ background-color: {DARK_CARD_BG} !important; border-color: {DARK_BORDER} !important; }}
    .text {{ color: {DARK_TEXT} !important; }}
    .muted {{ color: {DARK_TEXT_SECONDARY} !important; }}
    .divider {{ border-color: {DARK_BORDER} !important; }}
    .link-box {{ background-color: {DARK_PRIMARY_BG} !important; }}
    .link-box a {{ color: #5eead4 !important; }}
  }}
  @media only screen and (max-width: 520px) {{
    .container {{ width: 100% !important; }}
    .pad {{ padding: 28px 22px !important; }}
  }}
</style>
</head>
<body class="page" style="margin:0;padding:0;background-color:{PAGE_BG};font-family:{FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(heading)}</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PAGE_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" class="container" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" height="40" align="center" valign="middle" bgcolor="{PRIMARY}" style="width:40px;height:40px;border-radius:12px;background-color:{PRIMARY};background-image:linear-gradient(135deg,{PRIMARY} 0%,{PRIMARY_END} 100%);color:#ffffff;font-family:{FONT};font-size:20px;line-height:40px;">&#9889;&#xFE0E;</td>
                <td style="padding-left:12px;font-family:{FONT};">
                  <div class="text" style="font-size:16px;line-height:20px;font-weight:600;color:{TEXT};">{PRODUCT_NAME}</div>
                  <div class="muted" style="font-size:12px;line-height:18px;color:{TEXT_SECONDARY};">{escape(portal)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="card pad" style="background-color:{CARD_BG};border:1px solid {BORDER};border-radius:14px;padding:36px 32px;font-family:{FONT};">
            <h1 class="text" style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:{TEXT};">{escape(heading)}</h1>
            {body}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
              <tr>
                <td align="center" bgcolor="{PRIMARY}" style="border-radius:10px;background-color:{PRIMARY};">
                  <a href="{safe_link}" style="display:inline-block;padding:13px 28px;font-family:{FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">{escape(button_label)}</a>
                </td>
              </tr>
            </table>
            <p class="muted" style="margin:0 0 20px;font-size:13px;line-height:20px;color:{TEXT_SECONDARY};">{escape(note)}</p>
            <table role="presentation" class="divider" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid {BORDER};">
              <tr>
                <td style="padding-top:20px;">
                  <p class="muted" style="margin:0 0 8px;font-size:12px;line-height:18px;color:{TEXT_SECONDARY};">Button not working? Copy this link into your browser:</p>
                  <div class="link-box" style="padding:10px 12px;border-radius:8px;background-color:{PRIMARY_BG};font-size:12px;line-height:18px;word-break:break-all;"><a href="{safe_link}" style="color:{PRIMARY};text-decoration:none;">{escape(link)}</a></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 8px 0;font-family:{FONT};">
            <p class="muted" style="margin:0;font-size:12px;line-height:18px;color:{TEXT_SECONDARY};">If you did not expect this email, you can safely ignore it.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""
