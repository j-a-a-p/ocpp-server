import boto3
from botocore.exceptions import BotoCoreError, NoCredentialsError
from constants import SES_ACCESS_KEY, SES_SECRET_KEY, SES_ENDPOINT_URL, AWS_REGION
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SESEmailSender:
    def __init__(self):
        """Initialize the SES client."""
        if not SES_ACCESS_KEY or not SES_SECRET_KEY:
            logger.error("AWS SES credentials not configured")
            raise ValueError("AWS SES credentials not configured")
            
        self.ses_client = boto3.client(
            "ses",
            aws_access_key_id=SES_ACCESS_KEY,
            aws_secret_access_key=SES_SECRET_KEY,
            region_name=AWS_REGION,
            endpoint_url=SES_ENDPOINT_URL  # None means the real AWS endpoint
        )

    def send_email(self, sender, recipient, subject, body, html_body=None):
        """
        Sends an email using AWS SES.

        Parameters:
        sender (str): Verified sender email address.
        recipient (str): Recipient email address.
        subject (str): Email subject.
        body (str): Email body (plain text).
        html_body (str, optional): HTML version of the body, shown by clients that support it.
        
        Returns:
        dict: AWS SES response
        
        Raises:
        Exception: If email sending fails
        """
        try:
            logger.info(f"Sending email to {recipient}")
            message_body = {"Text": {"Data": body, "Charset": "UTF-8"}}
            if html_body:
                message_body["Html"] = {"Data": html_body, "Charset": "UTF-8"}
            response = self.ses_client.send_email(
                Source=sender,
                Destination={"ToAddresses": [recipient]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": message_body,
                }
            )
            logger.info(f"Email sent successfully to {recipient}")
            return response
        except NoCredentialsError:
            error_msg = "Error: No valid AWS credentials provided."
            logger.error(error_msg)
            raise Exception(error_msg)
        except BotoCoreError as e:
            error_msg = f"Error sending email via AWS SES: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Unexpected error sending email: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)