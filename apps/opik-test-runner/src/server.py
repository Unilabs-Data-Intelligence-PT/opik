from fastapi import FastAPI
from tasks import run_python_script
from pydantic import BaseModel
from my_sql import create_connection,save_code_file
app = FastAPI()

class PythonScript(BaseModel):
    name: str
    code: str

@app.post("/test")
def create_script(script: PythonScript):
    conn=create_connection()
    scriptId=save_code_file(conn,script.name, script.code)
    if scriptId:
        run_python_script.delay(scriptId)
        return {"message": "Script added to the queue!", "id": scriptId}
    return {"message": "Failed to add script to the queue."}

