import ast
import sys

try:
    with open('frontend/src/components/OrdenesView.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
    # This won't work for JSX directly, but maybe we can find obvious stuff
    print("File read successfully")
except Exception as e:
    print(f"Error reading file: {e}")
