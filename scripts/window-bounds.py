"""Read physical window bounds for the Electron compatibility screenshot path."""
import ctypes
import ctypes.wintypes as wt
import json
import sys

window = wt.HWND(int(sys.argv[1]))
user32 = ctypes.WinDLL('user32', use_last_error=True)
user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
user32.IsWindow.argtypes = [wt.HWND]
if not user32.IsWindow(window):
    raise RuntimeError('Window no longer exists; select it again.')
if '--require-foreground' in sys.argv:
    user32.GetForegroundWindow.restype = wt.HWND
    user32.GetAncestor.argtypes = [wt.HWND, wt.UINT]
    user32.GetAncestor.restype = wt.HWND
    foreground = user32.GetForegroundWindow()
    if foreground != window.value and user32.GetAncestor(foreground, 3) != window.value:
        raise RuntimeError('Target window must be foreground for popup-inclusive capture.')
rect = wt.RECT()
dwm = ctypes.WinDLL('dwmapi')
dwm.DwmGetWindowAttribute.argtypes = [wt.HWND, wt.DWORD, ctypes.c_void_p, wt.DWORD]
result = dwm.DwmGetWindowAttribute(window, 9, ctypes.byref(rect), ctypes.sizeof(rect))
if result:
    user32.GetWindowRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
    if not user32.GetWindowRect(window, ctypes.byref(rect)):
        raise ctypes.WinError(ctypes.get_last_error())
bounds = dict(x=rect.left, y=rect.top, width=rect.right-rect.left, height=rect.bottom-rect.top)
print(','.join(str(value) for value in bounds.values()) if '--csv' in sys.argv else json.dumps(bounds))
