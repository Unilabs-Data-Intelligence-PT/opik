import mysql.connector
from mysql.connector import Error
import uuid
import os

DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': 'opik',
    'database': 'opik'
}

def create_connection():
    """Create a database connection and return it."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            print("Successfully connected to MySQL database")
            return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def create_code_table(connection):
    """
    Creates the `python_code` table if it doesn't already exist.
    The table stores a unique ID, the original filename, and the code content.
    """
    cursor = connection.cursor()
    create_table_query = """
    CREATE TABLE IF NOT EXISTS python_code (
        id VARCHAR(36) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        code_content LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    try:
        cursor.execute(create_table_query)
        connection.commit()
        print("Table 'python_code' is ready.")
    except Error as e:
        print(f"Error creating table: {e}")
    finally:
        cursor.close()

def save_code_file(connection, test_name, code_str):
    create_code_table(connection)
    """
    Saves a code string to the database.
    Returns the unique ID of the saved code.
    """
    unique_id = str(uuid.uuid4())
    try:
        cursor = connection.cursor()
        insert_query = """
        INSERT INTO python_code (id, filename, code_content)
        VALUES (%s, %s, %s);
        """
        cursor.execute(insert_query, (unique_id, test_name, code_str))
        connection.commit()
        print(f"File '{test_name}' saved to database with ID: {unique_id}")
        return unique_id
    except Error as e:
        print(f"Error saving code file to database: {e}")
        return None
    finally:
        cursor.close()

def load_code_by_id(connection, code_id):
    """
    Retrieves a code string from the database using its unique ID.
    Returns the code string or None if not found.
    """
    try:
        cursor = connection.cursor(dictionary=True)
        select_query = "SELECT code_content FROM python_code WHERE id = %s;"
        cursor.execute(select_query, (code_id,))
        record = cursor.fetchone()

        if record:
            print(f"Successfully retrieved code for ID: {code_id}")
            return record['code_content']
        else:
            print(f"No code found for ID: {code_id}")
            return None
    except Error as e:
        print(f"Error loading code from database: {e}")
        return None
    finally:
        cursor.close()

# --- Example Usage ---
if __name__ == "__main__":
    # Create a dummy Python file for demonstration
    dummy_file_path = "example_script.py"
    with open(dummy_file_path, "w") as f:
        f.write("# This is a dummy Python script\n")
        f.write("def say_hello():\n")
        f.write("    print('Hello from a database-stored script!')\n")

    # Connect to the database
    db_connection = create_connection()

    if db_connection:
        # 1. Ensure the table exists
        create_code_table(db_connection)

        # 2. Save the dummy script to the database
        saved_id = save_code_file(db_connection, dummy_file_path)

        if saved_id:
            # 3. Load the code back from the database
            loaded_code = load_code_by_id(db_connection, saved_id)

            if loaded_code:
                print("\n--- Loaded Code Content ---")
                print(loaded_code)
                print("---------------------------\n")

                # You could now dynamically execute this code
                # exec(loaded_code)

        # Always close the connection
        if db_connection.is_connected():
            db_connection.close()
            print("MySQL connection is closed.")

    # Clean up the dummy file
    os.remove(dummy_file_path)
