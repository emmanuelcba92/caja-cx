import requests
import json
import sys

BASE_URL = "http://127.0.0.1:5000"

def test_add_professional():
    print("Testing POST /profesionales...")
    try:
        payload = {"nombre": "Dr. Test API", "categoria": "ORL"}
        response = requests.post(f"{BASE_URL}/profesionales", json=payload)
        
        if response.status_code == 201:
            print("SUCCESS: Professional added.")
            return True
        else:
            print(f"FAILED: Status {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def test_get_professionals():
    print("Testing GET /profesionales...")
    try:
        response = requests.get(f"{BASE_URL}/profesionales")
        if response.status_code == 200:
            profs = response.json()
            print(f"SUCCESS: Retrieved {len(profs)} professionals.")
            found = any(p['nombre'] == "Dr. Test API" for p in profs)
            if found:
                print("SUCCESS: Created professional found in list.")
            else:
                print("FAILURE: Created professional NOT found (Persistence issue?).")
            return found
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    if test_add_professional() and test_get_professionals():
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)
