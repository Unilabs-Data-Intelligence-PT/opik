from celery import Celery
from my_sql import create_connection, load_code_by_id
import os
app = Celery('tasks', broker=os.getenv('REDIS_URL'))

@app.task
def run_python_script(script_id):
    conn = create_connection()
    script = load_code_by_id(conn, script_id)
    exec(script)
