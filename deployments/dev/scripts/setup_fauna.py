import subprocess
import time
import re
import json

MAX_RETRIES = 5
SECONDS_BETWEEN_RETRIES = 5
FENSAK_DB_NAME = "fensak"
GET_FAUNA_SECRET_RE = re.compile(r"\s*secret: ([a-zA-Z0-9-_]+)")


def execp_with_retry(*cmd) -> bytes:
    for _ in range(MAX_RETRIES):
        ret = subprocess.run(cmd, capture_output=True)
        if ret.returncode == 0:
            print(ret.stderr.decode("utf-8"))
            print(ret.stdout.decode("utf-8"))
            return ret.stdout

        print(f"Command '{' '.join(cmd)}' failed")
        print("STDERR")
        print(ret.stderr.decode("utf-8"))
        print()
        print("STDOUT")
        print(ret.stdout.decode("utf-8"))
        print()
        print()
        time.sleep(SECONDS_BETWEEN_RETRIES)

    raise Exception(f"Max trials reached running command '{' '.join(cmd)}'")


def run():
    dbs = execp_with_retry("fauna", "list-databases")
    if FENSAK_DB_NAME not in dbs.decode("utf-8"):
        execp_with_retry("fauna", "create-database", FENSAK_DB_NAME)
        out = execp_with_retry("fauna", "create-key", FENSAK_DB_NAME)
        key = None
        for l in out.decode("utf-8").splitlines():
            m = GET_FAUNA_SECRET_RE.match(l)
            if m:
                key = m.group(1)
                break
        if key is None:
            raise Exception(f"Could not parse fauna create-key output:\n{out.decode('utf-8')}")

        with open("/workspace/config/local.json5", "w") as f:
            cfg = {
                "faunadb": {
                    "apiKey": key,
                }
            }
            json.dump(cfg, f)

    else:
        print(f"{FENSAK_DB_NAME} already exists")


if __name__ == "__main__":
    run()
