import os

import uvicorn


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("RELOAD", "1").lower() not in {"0", "false", "no"}
    uvicorn.run("main:app", host=host, port=port, reload=reload_enabled)
