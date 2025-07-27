import boto3
from botocore.exceptions import BotoCoreError, NoCredentialsError
from constants import SES_ACCESS_KEY, SES_SECRET_KEY, AWS_REGION

class SESEmailSender:
    def __init__(self):
        """Initialize the SES client."""
        self.ses_client = boto3.client(
            "ses",
            aws_access_key_id=SES_ACCESS_KEY,
            aws_secret_access_key=SES_SECRET_KEY,
            region_name=AWS_REGION
        )

    def send_email(self, sender, recipient, subject, body):
        """
        Sends an email using AWS SES.

        Parameters:
        sender (str): Verified sender email address.
        recipient (str): Recipient email address.
        subject (str): Email subject.
        body (str): Email body (plain text).
        """
        try:
            response = self.ses_client.send_email(
                Source=sender,
                Destination={"ToAddresses": [recipient]},
                Message={
                    "Subject": {"Data": subject},
                    "Body": {"Text": {"Data": body}},
                }
            )
            return response
        except NoCredentialsError:
            return "Error: No valid AWS credentials provided."
        except BotoCoreError as e:
            return f"Error: {str(e)}"