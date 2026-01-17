import requests

try:
    # Test ORL 1
    print("Fetching ORL 1 (Role 1)...")
    r = requests.get('http://127.0.0.1:5000/liquidacion/ORL%201?role=1&start_date=2026-01-17&end_date=2026-01-17')
    print(f"Status: {r.status_code}")
    data = r.json()
    if data and 'entradas' in data:
        print(f"Entries found: {len(data['entradas'])}")
        for e in data['entradas']:
            print(f" - {e['paciente']} | {e['liq_amount']}")
    else:
        print("No entries or error", data)

    print("-" * 20)
    
    # Test Estetica (Role 2)
    print("Fetching Estetica (Role 2)...")
    r = requests.get('http://127.0.0.1:5000/liquidacion/Estetica?role=2&start_date=2026-01-17&end_date=2026-01-17')
    print(f"Status: {r.status_code}")
    data = r.json()
    if data and 'entradas' in data:
        print(f"Entries found: {len(data['entradas'])}")
        for e in data['entradas']:
            print(f" - {e['paciente']} | {e['liq_amount']}")
    else:
        print("No entries or error", data)

except Exception as e:
    print(e)
