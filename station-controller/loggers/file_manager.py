import os

class FileManager:
    """Handles file existence and directory creation."""

    def _ensure_file_exists(self, file_path):
        """Ensure the file and its directory exist. Create them if necessary."""
        directory = os.path.dirname(file_path)

        # Create directory if it doesn't exist
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)

        # Create file if it doesn't exist
        if not os.path.exists(file_path):
            with open(file_path, 'w', encoding="utf-8") as file:
                pass  # Create an empty file

        return file_path  # Return the file path for convenience
