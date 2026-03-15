from moorcheh_sdk import MoorchehClient

NAMESPACE = "aasha-clinical-protocols"

with MoorchehClient(api_key="inCBo32kWO2ATMfC83WXRa6G2s1eXhLX3k4egKIC") as client:
    client.documents.upload_file(
        namespace_name=NAMESPACE,
        file_path="2025 WHO Maternal Health Guidelines.pdf"
    )