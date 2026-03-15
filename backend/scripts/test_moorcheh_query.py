from moorcheh_sdk import MoorchehClient

NAMESPACE = "aasha-clinical-protocols"

with MoorchehClient(api_key="inCBo32kWO2ATMfC83WXRa6G2s1eXhLX3k4egKIC") as client:
    results = client.similarity_search.query(
        namespaces=[NAMESPACE],
        query="preeclampsia baby",
        top_k=5,
    )
    matches = results.get("matches") or results.get("results") or []
    print(f"Got {len(matches)} matches.")
    for m in matches:
        print("-------")
        print(f"ID: {m.get('id')}")
        print(f"Text snippet: {m.get('text', '')}...")
        metadata = m.get('metadata')
        print(f"Type of metadata: {type(metadata)}")
        print(f"Metadata: {metadata}")
        source = metadata.get("source") if isinstance(metadata, dict) else None
        print(f"Source: {source}")
