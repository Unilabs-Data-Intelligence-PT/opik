from fastapi import FastAPI
from tasks import run_python_script
from pydantic import BaseModel
from my_sql import create_connection,save_code_file
from packages import install
from importlib.metadata import version
import sys
app = FastAPI()

class PythonScript(BaseModel):
    name: str
    install_dependencies: list[str]
    code: str

@app.post("/queue")
def create_script(script: PythonScript):
    for package in script.install_dependencies:
        try:
            #will still fail if package name is different from installation, but catches popular libs
            __import__(package)
        except ImportError:
            install(package)

    conn=create_connection()
    scriptId=save_code_file(conn,script.name, script.code)
    if scriptId:
        run_python_script.delay(scriptId)
        return {"message": "Script added to the queue!", "id": scriptId}
    return {"message": "Failed to add script to the queue."}

@app.get("/packages/{package_name}")
def getPackageVersion(package_name: str):
    try:
        pkg = __import__(package_name)
        return {"name": pkg.__name__, "version": pkg.__version__}
    except ImportError:
        return {"error": "Package not found"}
    except AttributeError:
        try:
            ver = version(package_name)
            return {"name": package_name, "version": ver}
        except Exception:
            return {"error": "Version information not available"}

class PackageInfo(BaseModel):
    installString: str

@app.post("/packages")
def installPackage(package_info: PackageInfo):
    install(package_info.installString)
    return {"message": "Package installation initiated"}


class Packages(BaseModel):
    packages: list[str]
@app.post("/packages/get")
def getPackagesVersion(package_info: Packages):
    versions = {}
    for package in package_info.packages:
        if package in sys.builtin_module_names or "site-packages" not in (getattr(sys.modules.get(package,{}), '__file__', 'site-packages') or 'site-packages'):
            versions[package] = {"version": "builtin"}
            continue
        try:
            pkg = __import__(package)
            versions[package] = {"version": pkg.__version__}
        except ImportError:
            versions[package] = None
        except AttributeError:
            try:
                ver = version(package)
                versions[package] = {"version": ver}
            except Exception:
                versions[package] = None

    return versions