from celery import Celery
from my_sql import create_connection, load_code_by_id

app = Celery('tasks', broker='redis://:opik@localhost')

@app.task
def run_python_script(script_id):
    conn = create_connection()
    script = load_code_by_id(conn, script_id)
    exec(script)
