@echo off
setlocal
rem 绕线计算器一键启动：挑空闲端口 → 起本地服务 → 自动打开浏览器
cd /d "%~dp0"
if not exist "index.html" (
    echo [错误] 未找到 index.html，请把本脚本放在 winding-calculator 目录下。
    pause
    exit /b 1
)

rem 定位 Python：优先 python，其次 py 启动器（绕过 Windows 商店的 python 占位符）
set PY=
python --version >nul 2>nul && set PY=python
if not defined PY py --version >nul 2>nul && set PY=py
if not defined PY (
    echo [错误] 未找到 Python，请安装 Python 3 后重试；或直接双击 index.html 打开计算器。
    pause
    exit /b 1
)

rem 选端口：优先 8741，被占用则依次尝试 8742/8743，最后随机取 20000-35000
rem connect_ex 返回 0 表示端口被占用，此时命令以退出码 1 结束、该端口被跳过
set PORT=
%PY% -c "import socket,sys;s=socket.socket();e=s.connect_ex(('127.0.0.1',8741));s.close();sys.exit(e==0)" >nul 2>nul && set PORT=8741
if not defined PORT %PY% -c "import socket,sys;s=socket.socket();e=s.connect_ex(('127.0.0.1',8742));s.close();sys.exit(e==0)" >nul 2>nul && set PORT=8742
if not defined PORT %PY% -c "import socket,sys;s=socket.socket();e=s.connect_ex(('127.0.0.1',8743));s.close();sys.exit(e==0)" >nul 2>nul && set PORT=8743
if not defined PORT set /a PORT=20000 + %RANDOM% * 15000 / 32768

echo ==============================================
echo   绕线计算器已启动:  http://127.0.0.1:%PORT%/
echo   浏览器将自动打开；关闭本窗口即停止服务。
echo ==============================================
start "" "http://127.0.0.1:%PORT%/"
%PY% -m http.server %PORT% --bind 127.0.0.1
