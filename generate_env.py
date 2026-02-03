import os
import json
from pathlib import Path

def parse_env(path):
    d = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                if '=' in s:
                    k, v = s.split('=', 1)
                    d[k.strip()] = v.strip()
    except Exception:
        pass
    return d

def main():
    root_dir = Path(__file__).parent
    env_path = root_dir / '.env'
    
    # Try reading .env
    env = parse_env(env_path) if env_path.exists() else {}
    
    # Get values from .env or environment variables
    # Priority: .env > os.environ (or vice versa depending on preference, usually os.environ wins in prod, but here .env is local config)
    # Let's stick to .env file as primary source for this local setup
    
    url = env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL') or ''
    key = env.get('SUPABASE_ANON_KEY') or env.get('VITE_SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_ANON_KEY') or ''
    
    config_dir = root_dir / 'config'
    config_dir.mkdir(exist_ok=True)
    
    output_path = config_dir / 'env.js'
    
    content = f"window.__AGRILOVERS_CONFIG = {json.dumps({'url': url, 'anonKey': key})};"
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Generated {output_path} with url={url}")

if __name__ == '__main__':
    main()
