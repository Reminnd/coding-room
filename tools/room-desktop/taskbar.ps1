param([string]$Shortcut, [long]$WindowHandle = 0, [string]$Launcher, [string]$Icon)
$ErrorActionPreference = 'Stop'
# Keep taskbar relaunch on the same managed Codex entry as the shortcuts.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RoomTaskbar {
 [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid format; public uint id; }
 [StructLayout(LayoutKind.Explicit, Size=24)] public struct Value { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr text; }
 [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface Store {
  void GetCount(out uint count); void GetAt(uint index,out Key key); void GetValue(ref Key key,out Value value);
  void SetValue(ref Key key,ref Value value); void Commit();
 }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void SHGetPropertyStoreFromParsingName(string path,IntPtr context,uint flags,ref Guid iid,out Store store);
 [DllImport("shell32.dll",PreserveSig=false)] static extern void SHGetPropertyStoreForWindow(IntPtr window,ref Guid iid,out Store store);
 [DllImport("propsys.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void PSGetPropertyKeyFromName(string name,out Key key);
 static void Set(Store store,string name,string text) {
  Key key; PSGetPropertyKeyFromName(name,out key);
  var value = new Value { type=31, text=Marshal.StringToCoTaskMemUni(text) };
  try { store.SetValue(ref key,ref value); } finally { Marshal.FreeCoTaskMem(value.text); }
 }
 public static void Shortcut(string path) {
  Guid iid=typeof(Store).GUID; Store store; SHGetPropertyStoreFromParsingName(path,IntPtr.Zero,2,ref iid,out store);
  try { Set(store,"System.AppUserModel.ID","AgentRoom.Codex"); store.Commit(); } finally { Marshal.ReleaseComObject(store); }
 }
 public static void Window(long handle,string launcher,string icon) {
  Guid iid=typeof(Store).GUID; Store store; SHGetPropertyStoreForWindow(new IntPtr(handle),ref iid,out store);
  try {
   Set(store,"System.AppUserModel.RelaunchCommand","\""+launcher+"\" --codex");
   Set(store,"System.AppUserModel.RelaunchDisplayNameResource","Codex");
   Set(store,"System.AppUserModel.RelaunchIconResource",icon+",0");
   Set(store,"System.AppUserModel.ID","AgentRoom.Codex");
  } finally { Marshal.ReleaseComObject(store); }
 }
}
'@
if ($Shortcut) { [RoomTaskbar]::Shortcut($Shortcut) }
if ($WindowHandle) { [RoomTaskbar]::Window($WindowHandle,$Launcher,$Icon) }
