using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Markup;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

public static class SetupProgram {
 public const string ProductId="ONCLASSTIME-77FA8D80-AD49-4563-9567-793E46B89A15";
 public const string RegistryPath=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ONclasstime";
#if UNINSTALLER
 public const bool Removing=true;
#else
 public const bool Removing=false;
#endif
 public static string Target="";
 public static bool Quiet;
 public static bool KeepLocalData;
 public static string HelperDirectory;
 [STAThread] public static void Main(string[] args) {
  try {
   Quiet=args.Contains("--quiet");KeepLocalData=args.Contains("--keep-local-data");
   int pos=Array.IndexOf(args,"--dir");Target=pos>=0&&pos+1<args.Length?Path.GetFullPath(args[pos+1]):Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","ONclasstime");
   if(Removing){int rootArg=Array.IndexOf(args,"--target");if(rootArg<0){string original=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);ValidateOwned(original);string temp=Path.Combine(Path.GetTempPath(),"ONclasstime-Uninstall-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);File.WriteAllText(Path.Combine(temp,"cleanup.owner"),ProductId);string exe=Path.Combine(temp,"ONclasstime-Uninstall.exe");File.Copy(Assembly.GetExecutingAssembly().Location,exe);Process.Start(new ProcessStartInfo(exe,"--target \""+original+"\""+(Quiet?" --quiet":"")+(KeepLocalData?" --keep-local-data":"")){UseShellExecute=false,CreateNoWindow=Quiet});return;}Target=Path.GetFullPath(args[rootArg+1]);string helper=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);if(helper.StartsWith(Path.GetFullPath(Path.Combine(Path.GetTempPath(),"ONclasstime-Uninstall-")),StringComparison.OrdinalIgnoreCase))HelperDirectory=helper;}
   if(Quiet){if(Removing)Uninstall(Target);else Install(Target,true,delegate(int p,string s) {},CancellationToken.None);return;}
   var app=new Application();app.ShutdownMode=ShutdownMode.OnMainWindowClose;app.Run(new SetupWindow());
  }catch(Exception error){Environment.ExitCode=1;try{File.WriteAllText(Path.Combine(Path.GetTempPath(),"ONclasstime-setup-last-error.txt"),error.ToString());}catch{}if(!Quiet)MessageBox.Show(error.Message,"ONclasstime",MessageBoxButton.OK,MessageBoxImage.Warning);}
  finally{if(Removing&&!String.IsNullOrEmpty(HelperDirectory))ScheduleHelperCleanup();}
 }
 public static string SafeRoot(string value){string full=Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);if(full.Length<8||full==Path.GetPathRoot(full).TrimEnd('\\')||full.Equals(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),StringComparison.OrdinalIgnoreCase)||full.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.Windows)+"\\",StringComparison.OrdinalIgnoreCase))throw new IOException("请选择专用的 ONclasstime 安装目录。");foreach(string forbidden in new[]{Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)}){if(!String.IsNullOrEmpty(forbidden)&&full.Equals(forbidden,StringComparison.OrdinalIgnoreCase))throw new IOException("请选择应用专用目录。");}for(string ancestor=full;!String.IsNullOrEmpty(ancestor);ancestor=Path.GetDirectoryName(ancestor)){if(Directory.Exists(ancestor)&&(File.GetAttributes(ancestor)&FileAttributes.ReparsePoint)!=0)throw new IOException("安装路径不能经过目录联接。");}if(Directory.Exists(full)&&(File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0)throw new IOException("安装目录不能是符号链接或目录联接。");return full;}
 public static void ValidateOwned(string root){root=SafeRoot(root);string marker=Path.Combine(root,"onclasstime.install");if(!File.Exists(marker)||File.ReadAllText(marker)!=ProductId)throw new IOException("此目录不是可验证的 ONclasstime 安装目录，已停止操作。");}
 static void EnsureClosed(string root){foreach(Process p in Process.GetProcessesByName("ONclasstime")){try{if(p.MainModule.FileName.StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase))throw new IOException("请先关闭 ONclasstime，再继续安装或卸载。");}catch(System.ComponentModel.Win32Exception){}}}
 static void VerifyTree(string root){foreach(string d in Directory.GetDirectories(root)){if((File.GetAttributes(d)&FileAttributes.ReparsePoint)!=0)throw new IOException("程序目录中发现目录联接，已停止清理。");VerifyTree(d);}}
 static void DeleteOwnedTree(string root){ValidateOwned(root);VerifyTree(root);Directory.Delete(root,true);}
 public static void Install(string selected,bool shortcut,Action<int,string> progress,CancellationToken cancel){
  string root=SafeRoot(selected),parent=Path.GetDirectoryName(root);Directory.CreateDirectory(parent);EnsureClosed(root);
  if(Directory.Exists(root)){ValidateOwned(root);}
  string stage=Path.Combine(parent,".ONclasstime-stage-"+Guid.NewGuid().ToString("N"));string backup=Path.Combine(parent,".ONclasstime-backup-"+Guid.NewGuid().ToString("N"));bool movedOld=false,committed=false;
  try{
   progress(0,"正在验证安装文件…");
   using(Stream resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")){
    if(resource==null)throw new IOException("安装文件不完整，请重新下载。");
    string digest;using(SHA256 sha=SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(resource)).Replace("-","").ToLowerInvariant();if(digest!=PayloadInfo.Hash)throw new IOException("安装文件校验失败，请从官网下载完整安装包。");resource.Position=0;
    using(var zip=new ZipArchive(resource,ZipArchiveMode.Read)){
     long total=zip.Entries.Sum(e=>e.Length),written=0;Directory.CreateDirectory(stage);string prefix=Path.GetFullPath(stage)+"\\";var clock=Stopwatch.StartNew();long last=0;
     foreach(var entry in zip.Entries){cancel.ThrowIfCancellationRequested();string path=Path.GetFullPath(Path.Combine(stage,entry.FullName.Replace('/',Path.DirectorySeparatorChar)));if(!path.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new IOException("安装文件中存在非法路径。");if(entry.FullName.EndsWith("/")){Directory.CreateDirectory(path);continue;}Directory.CreateDirectory(Path.GetDirectoryName(path));
      using(Stream input=entry.Open())using(Stream output=File.Create(path)){byte[] block=new byte[128*1024];int n;while((n=input.Read(block,0,block.Length))>0){cancel.ThrowIfCancellationRequested();output.Write(block,0,n);written+=n;if(clock.ElapsedMilliseconds-last>50){last=clock.ElapsedMilliseconds;progress((int)(written*95/Math.Max(1,total)),"正在安装学习空间…  "+(written/1048576)+" / "+(total/1048576)+" MB");}}}
     }
    }
   }
   cancel.ThrowIfCancellationRequested();File.WriteAllText(Path.Combine(stage,"onclasstime.install"),ProductId);EnsureClosed(root);progress(96,"正在完成应用设置…");
   if(Directory.Exists(root)){Directory.Move(root,backup);movedOld=true;}Directory.Move(stage,root);committed=true;
   if(shortcut)CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"ONclasstime.lnk"),root);
   string menu=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),"Programs","ONclasstime");Directory.CreateDirectory(menu);CreateShortcut(Path.Combine(menu,"ONclasstime.lnk"),root);CreateShortcut(Path.Combine(menu,"完整卸载 ONclasstime.lnk"),root,"ONclasstime-Uninstall.exe");
   using(RegistryKey key=Registry.CurrentUser.CreateSubKey(RegistryPath)){key.SetValue("DisplayName","ONclasstime");key.SetValue("DisplayVersion","3.1.0");key.SetValue("Publisher","ONclasstime");key.SetValue("InstallLocation",root);key.SetValue("DisplayIcon",Path.Combine(root,"ONclasstime.exe"));key.SetValue("UninstallString","\""+Path.Combine(root,"ONclasstime-Uninstall.exe")+"\"");key.SetValue("QuietUninstallString","\""+Path.Combine(root,"ONclasstime-Uninstall.exe")+"\" --quiet");key.SetValue("NoModify",1);key.SetValue("NoRepair",1);key.SetValue("URLInfoAbout",PayloadInfo.Website);key.SetValue("EstimatedSize",(int)Math.Min(int.MaxValue,new DirectoryInfo(root).EnumerateFiles("*",SearchOption.AllDirectories).Sum(f=>f.Length)/1024));}
   if(movedOld)try{DeleteOwnedTree(backup);}catch{}progress(100,"安装完成");
  }catch{if(!committed&&movedOld&&!Directory.Exists(root))Directory.Move(backup,root);throw;}
  finally{if(Directory.Exists(stage)){string full=Path.GetFullPath(stage);VerifyTree(full);if(full.StartsWith(Path.GetFullPath(parent)+"\\.ONclasstime-stage-",StringComparison.OrdinalIgnoreCase)&&new DirectoryInfo(full).Name.StartsWith(".ONclasstime-stage-"))Directory.Delete(full,true);}}
 }
 static void CreateShortcut(string path,string root,string executable="ONclasstime.exe"){object shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));object link=shell.GetType().InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{path});link.GetType().InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(root,executable)});link.GetType().InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{root});link.GetType().InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(root,"ONclasstime.exe")+",0"});link.GetType().InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);System.Runtime.InteropServices.Marshal.FinalReleaseComObject(link);System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);}
 static string LocalDataDirectory(){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"ONclasstime");}
 internal static void VerifyLocalData(string path,string allowed){
  if(!Directory.Exists(path))return;
  if(!Path.GetFullPath(path).Equals(Path.GetFullPath(allowed),StringComparison.OrdinalIgnoreCase))throw new IOException("本机资料路径校验失败。");
  if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new IOException("本机资料目录为联接，已停止清理。");
  string marker=Path.Combine(path,"onclasstime.data");if(!File.Exists(marker)||File.ReadAllText(marker)!=ProductId)throw new IOException("本机资料归属无法确认，已停止清理以保护其他文件。");
  VerifyTree(path);
 }
 internal static void ClearLocalData(string path,string allowed){VerifyLocalData(path,allowed);if(Directory.Exists(path))Directory.Delete(path,true);}
 public static void Uninstall(string selected){
  string root=SafeRoot(selected);ValidateOwned(root);EnsureClosed(root);
  if(Process.GetProcessesByName("ONclasstime").Length>0)throw new IOException("请先关闭所有 ONclasstime 窗口，再执行完整卸载。");
  string data=LocalDataDirectory();if(!KeepLocalData)ClearLocalData(data,data);
  DeleteOwnedTree(root);
  string menu=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),"Programs","ONclasstime");bool ownsRegistration;
  using(RegistryKey key=Registry.CurrentUser.OpenSubKey(RegistryPath)){ownsRegistration=key!=null&&String.Equals(key.GetValue("InstallLocation") as string,root,StringComparison.OrdinalIgnoreCase);}
  if(ownsRegistration){foreach(string path in new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"ONclasstime.lnk"),Path.Combine(menu,"ONclasstime.lnk"),Path.Combine(menu,"完整卸载 ONclasstime.lnk")})if(File.Exists(path))File.Delete(path);if(Directory.Exists(menu)&&!Directory.EnumerateFileSystemEntries(menu).Any())Directory.Delete(menu);Registry.CurrentUser.DeleteSubKeyTree(RegistryPath);}
 }
 static void ScheduleHelperCleanup(){
  try{
   string dir=Path.GetFullPath(HelperDirectory),prefix=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"ONclasstime-Uninstall-"));if(!dir.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))return;
   string script="$target='"+dir.Replace("'","''")+"';$prefix='"+prefix.Replace("'","''")+"';Wait-Process -Id "+Process.GetCurrentProcess().Id+" -ErrorAction SilentlyContinue;$full=[IO.Path]::GetFullPath($target);if(!$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){exit};$marker=Join-Path $full 'cleanup.owner';if(!(Test-Path -LiteralPath $marker)){exit};if([IO.File]::ReadAllText($marker) -ne '"+ProductId+"'){exit};$stack=New-Object 'Collections.Generic.Stack[string]';$stack.Push($full);while($stack.Count -gt 0){$path=$stack.Pop();if(([IO.File]::GetAttributes($path) -band [IO.FileAttributes]::ReparsePoint) -ne 0){exit};foreach($child in [IO.Directory]::GetDirectories($path)){$stack.Push($child)}};Remove-Item -LiteralPath $full -Recurse -Force";
   string encoded=Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(script));string powershell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");Process.Start(new ProcessStartInfo(powershell,"-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand "+encoded){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
  }catch{}
 }
}

public class SetupWindow:Window {
 Grid welcome,progressView,finish;Button primary,close,browse,cancel;TextBlock title,subtitle,step,percent,status,pathText,finishTitle;ProgressBar bar;CheckBox desktop,launch;bool running,done;CancellationTokenSource cancellation;
 const string Layout=@"<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' Width='1010' Height='650' WindowStartupLocation='CenterScreen' ResizeMode='NoResize' WindowStyle='None' AllowsTransparency='True' Background='Transparent' Title='ONclasstime Setup' FontFamily='Segoe UI,Microsoft YaHei UI'>
 <Border CornerRadius='22' Background='#FDFEFC' BorderBrush='#DCE5DD' BorderThickness='1'><Grid><Grid.ColumnDefinitions><ColumnDefinition Width='310'/><ColumnDefinition Width='*'/></Grid.ColumnDefinitions>
 <Border Background='#EDF3EB' CornerRadius='22,0,0,22'><Grid ClipToBounds='True'><StackPanel Margin='34,38,25,0' VerticalAlignment='Top'><Image x:Name='BrandLogo' Width='240' Height='65' Stretch='Uniform' HorizontalAlignment='Left'/><TextBlock Text='Power By ONtimeclass' FontSize='9' Foreground='#8EA7A7' Margin='2,9,0,0'/><TextBlock Text='YOUR TIME TO UNDERSTAND' FontSize='8' Foreground='#A5B29D' Margin='2,18,0,0' LetterSpacing='1'/></StackPanel>
 <Canvas Margin='-20,90,-20,0' VerticalAlignment='Center' Height='250'><Ellipse Width='330' Height='160' Stroke='#CEDCC8' StrokeThickness='1' Canvas.Left='-5' Canvas.Top='45'><Ellipse.RenderTransform><RotateTransform Angle='-28' CenterX='165' CenterY='80'/></Ellipse.RenderTransform></Ellipse><Ellipse Width='190' Height='240' Stroke='#D9E3D1' Canvas.Left='65' Canvas.Top='-5'/><TextBlock Text='ON' FontSize='84' FontWeight='Light' Foreground='#8FA486' Canvas.Left='86' Canvas.Top='55'/><TextBlock Text='classtime' FontSize='14' Foreground='#A0B294' Canvas.Left='102' Canvas.Top='145'/><Ellipse Width='10' Height='10' Fill='#CAB588' Canvas.Left='238' Canvas.Top='45'/><Ellipse Width='7' Height='7' Fill='#A7BA99' Canvas.Left='35' Canvas.Top='180'/></Canvas>
 <StackPanel Margin='36,0,30,40' VerticalAlignment='Bottom'><TextBlock Text='让好奇，' FontSize='24' Foreground='#4E6A58'/><TextBlock Text='有处发生。' FontSize='24' Foreground='#4E6A58' Margin='0,5,0,0'/><TextBlock Text='写下问题 · 听懂原理 · 练会方法' FontSize='10' Foreground='#A4B19B' Margin='0,18,0,0'/><TextBlock Text='Power By ONtimeclass' FontSize='9' Foreground='#7F9991' Margin='0,18,0,0'/><TextBlock Text='WINDOWS 10 / 11     ·     3.1.0' FontSize='8' Foreground='#B3BDAA' Margin='0,28,0,0'/></StackPanel></Grid></Border>
 <Grid Grid.Column='1' Margin='48,34,40,32'><Grid.RowDefinitions><RowDefinition Height='32'/><RowDefinition Height='*'/><RowDefinition Height='60'/></Grid.RowDefinitions><TextBlock x:Name='Step' Text='01  /  安装准备' FontSize='10' Foreground='#A6B1A2' VerticalAlignment='Center'/><Button x:Name='Close' Content='×' Width='30' Height='30' HorizontalAlignment='Right' Background='Transparent' BorderThickness='0' Foreground='#A4ADA1' FontSize='22' Cursor='Hand'/>
 <Grid Grid.Row='1'><Grid x:Name='Welcome'><Grid.RowDefinitions><RowDefinition Height='Auto'/><RowDefinition Height='Auto'/><RowDefinition Height='Auto'/><RowDefinition Height='Auto'/><RowDefinition Height='Auto'/></Grid.RowDefinitions><StackPanel><TextBlock x:Name='Title' Text='下一段学习时间，' FontSize='29' FontWeight='Normal' Foreground='#2F493A' Margin='0,30,0,0'/><TextBlock x:Name='Subheading' Text='从这里开始。' FontSize='29' Foreground='#2F493A' Margin='0,5,0,0'/><TextBlock x:Name='Subtitle' Text='欢迎安装 ONclasstime。给专注、好奇与理解，留一个专属空间。' FontSize='11' Foreground='#97A28F' TextWrapping='Wrap' LineHeight='22' Margin='0,18,0,0'/></StackPanel>
 <Border Grid.Row='1' Background='#F4F7F0' CornerRadius='12' Padding='18,17' Margin='0,25,0,0'><StackPanel><TextBlock Text='✓  全屏手写与多学科 AI 课堂' FontSize='11' Foreground='#7F9374'/><TextBlock Text='✓  题库练习、错题复习与学习笔记' FontSize='11' Foreground='#7F9374' Margin='0,10,0,0'/></StackPanel></Border>
 <StackPanel Grid.Row='2' Margin='0,24,0,0'><TextBlock x:Name='LocationLabel' Text='安装位置' FontSize='10' Foreground='#8E9C85'/><Grid Margin='0,9,0,0'><Grid.ColumnDefinitions><ColumnDefinition Width='*'/><ColumnDefinition Width='65'/></Grid.ColumnDefinitions><Border BorderBrush='#E1E8DB' BorderThickness='1' CornerRadius='8' Padding='11,10'><TextBlock x:Name='PathText' TextTrimming='CharacterEllipsis' FontSize='10' Foreground='#8C9B82'/></Border><Button Grid.Column='1' x:Name='Browse' Content='更改' Foreground='#7F9272' Background='Transparent' BorderThickness='0' FontSize='11' Cursor='Hand'/></Grid></StackPanel><CheckBox x:Name='Desktop' Grid.Row='3' Content='创建桌面快捷方式' IsChecked='True' FontSize='10' Foreground='#8D9D81' Margin='0,18,0,0'/><TextBlock x:Name='DataNotice' Grid.Row='4' Text='程序文件与学习资料分别保存。安装或升级不会删除你的账号资料。' FontSize='9' Foreground='#B0BAA6' TextWrapping='Wrap' Margin='0,17,0,0'/></Grid>
 <Grid x:Name='ProgressView' Visibility='Collapsed'><StackPanel VerticalAlignment='Center'><TextBlock Text='给新的理解，' FontSize='29' Foreground='#2F493A'/><TextBlock Text='准备一点空间。' FontSize='29' Foreground='#2F493A' Margin='0,5,0,0'/><TextBlock Text='安装正在进行，你的课堂很快就会就绪。' FontSize='11' Foreground='#9DA891' Margin='0,18,0,45'/><Grid><TextBlock x:Name='Status' Text='正在准备…' FontSize='11' Foreground='#8A9A7D'/><TextBlock x:Name='Percent' Text='0%' FontSize='12' Foreground='#5D7C50' HorizontalAlignment='Right'/></Grid><ProgressBar x:Name='Bar' Minimum='0' Maximum='100' Height='7' Margin='0,14,0,0' Foreground='#8FA67D' Background='#E7EDDF' BorderThickness='0'/><TextBlock Text='进度以实际文件安装量计算。请保持此窗口打开。' FontSize='9' Foreground='#B0BCA3' Margin='0,20,0,0'/></StackPanel></Grid>
 <Grid x:Name='Finish' Visibility='Collapsed'><StackPanel VerticalAlignment='Center'><Border Width='62' Height='62' Background='#EAF2E2' CornerRadius='31' HorizontalAlignment='Left' Margin='0,0,0,28'><TextBlock Text='✓' FontSize='30' Foreground='#8BA36F' HorizontalAlignment='Center' VerticalAlignment='Center'/></Border><TextBlock x:Name='FinishTitle' Text='准备好了，轮到你了。' FontSize='29' Foreground='#2F493A'/><TextBlock x:Name='FinishDescription' Text='ONclasstime 已安装。用一个问题，开启今天的学习。' FontSize='11' Foreground='#9AA78E' Margin='0,18,0,0' TextWrapping='Wrap'/><CheckBox x:Name='Launch' Content='启动 ONclasstime' IsChecked='True' FontSize='11' Foreground='#879A76' Margin='0,35,0,0'/></StackPanel></Grid></Grid>
 <Grid Grid.Row='2' VerticalAlignment='Bottom'><Button x:Name='Cancel' Content='暂不安装' BorderThickness='0' Background='Transparent' Foreground='#A4B097' FontSize='11' Padding='0,12' HorizontalAlignment='Left' Cursor='Hand'/><Button x:Name='Primary' Content='安装 ONclasstime  →' Foreground='White' Background='#58734E' BorderThickness='0' Padding='26,13' FontSize='12' HorizontalAlignment='Right' Cursor='Hand'><Button.Template><ControlTemplate TargetType='Button'><Border Background='{TemplateBinding Background}' CornerRadius='9' Padding='{TemplateBinding Padding}'><ContentPresenter HorizontalAlignment='Center'/></Border></ControlTemplate></Button.Template></Button></Grid></Grid></Grid></Border></Window>";
 public SetupWindow(){
  // WPF does not support letter spacing on TextBlock; the visual uses native font metrics.
  string xaml=Layout.Replace(" LetterSpacing='1'","");var template=(Window)XamlReader.Parse(xaml);var visual=(FrameworkElement)template.Content;template.Content=null;visual.Width=1010;visual.Height=650;Content=new Viewbox{Child=visual,Stretch=Stretch.Uniform};double fit=Math.Min(1,Math.Min((SystemParameters.WorkArea.Width-30)/1010,(SystemParameters.WorkArea.Height-30)/650));Width=1010*fit;Height=650*fit;WindowStartupLocation=WindowStartupLocation.CenterScreen;ResizeMode=ResizeMode.NoResize;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;Title="ONclasstime Setup";FontFamily=new FontFamily("Segoe UI,Microsoft YaHei UI");
  var names=template;using(Stream logo=Assembly.GetExecutingAssembly().GetManifestResourceStream("brand.xaml")){if(logo!=null)((Image)names.FindName("BrandLogo")).Source=(DrawingImage)XamlReader.Load(logo);}welcome=(Grid)names.FindName("Welcome");progressView=(Grid)names.FindName("ProgressView");finish=(Grid)names.FindName("Finish");primary=(Button)names.FindName("Primary");close=(Button)names.FindName("Close");browse=(Button)names.FindName("Browse");cancel=(Button)names.FindName("Cancel");title=(TextBlock)names.FindName("Title");subtitle=(TextBlock)names.FindName("Subtitle");step=(TextBlock)names.FindName("Step");percent=(TextBlock)names.FindName("Percent");status=(TextBlock)names.FindName("Status");pathText=(TextBlock)names.FindName("PathText");finishTitle=(TextBlock)names.FindName("FinishTitle");bar=(ProgressBar)names.FindName("Bar");desktop=(CheckBox)names.FindName("Desktop");launch=(CheckBox)names.FindName("Launch");pathText.Text=SetupProgram.Target;
  MouseLeftButtonDown+=(s,e)=>{if(e.OriginalSource is Border||e.OriginalSource is Grid)try{DragMove();}catch{}};
  close.Click+=(s,e)=>RequestClose();cancel.Click+=(s,e)=>RequestClose();browse.Click+=(s,e)=>{using(var dialog=new System.Windows.Forms.FolderBrowserDialog()){dialog.Description="选择程序安装位置，应用将放入其中的 ONclasstime 文件夹";dialog.SelectedPath=Path.GetDirectoryName(SetupProgram.Target);if(dialog.ShowDialog()==System.Windows.Forms.DialogResult.OK){SetupProgram.Target=Path.Combine(dialog.SelectedPath,"ONclasstime");pathText.Text=SetupProgram.Target;}}};
  primary.Click+=Start;Closing+=(s,e)=>{if(running){e.Cancel=true;RequestClose();}};
  if(SetupProgram.Removing){((TextBlock)names.FindName("Subheading")).Text="云端资料为你保留。";((TextBlock)names.FindName("LocationLabel")).Text="程序位置";((TextBlock)names.FindName("DataNotice")).Text="将清除此 Windows 用户的本机草稿、登录状态与缓存。云端资料保留。";((TextBlock)names.FindName("FinishDescription")).Text="程序和本机资料已移除。云端账号与学习记录继续为你保留。";step.Text="ONCLASSTIME / 卸载";title.Text="完整清理，安心告别。";subtitle.Text="移除程序、本机草稿、登录状态与缓存。云端账号及学习资料保留。";primary.Content="一键完整卸载";desktop.Visibility=Visibility.Collapsed;browse.Visibility=Visibility.Collapsed;cancel.Content="保留应用";}
 }
 static Task RunWorker(Action action){var completion=new TaskCompletionSource<bool>();var thread=new Thread(()=>{try{action();completion.SetResult(true);}catch(Exception e){completion.SetException(e);}});thread.SetApartmentState(ApartmentState.STA);thread.IsBackground=true;thread.Start();return completion.Task;}
 void RequestClose(){if(running){if(MessageBox.Show("确定取消安装？已完成的账号资料不会受影响。","ONclasstime",MessageBoxButton.YesNo,MessageBoxImage.Question)==MessageBoxResult.Yes){cancellation.Cancel();cancel.IsEnabled=false;cancel.Content="正在收尾…";}return;}Close();}
 async void Start(object sender,RoutedEventArgs e){if(done){if(!SetupProgram.Removing&&launch.IsChecked==true)Process.Start(new ProcessStartInfo(Path.Combine(SetupProgram.Target,"ONclasstime.exe")){WorkingDirectory=SetupProgram.Target,UseShellExecute=true});Close();return;}if(running)return;running=true;cancellation=new CancellationTokenSource();welcome.Visibility=Visibility.Collapsed;progressView.Visibility=Visibility.Visible;primary.Visibility=Visibility.Collapsed;cancel.Content="取消安装";if(SetupProgram.Removing){cancel.IsEnabled=false;close.IsEnabled=false;bar.IsIndeterminate=true;percent.Visibility=Visibility.Collapsed;}step.Text=SetupProgram.Removing?"02 / 正在卸载":"02 / 正在安装";bool shortcut=desktop.IsChecked==true;
  try{await RunWorker(()=>{if(SetupProgram.Removing)SetupProgram.Uninstall(SetupProgram.Target);else SetupProgram.Install(SetupProgram.Target,shortcut,(p,s)=>Dispatcher.BeginInvoke(new Action(()=>{bar.Value=p;percent.Text=p+"%";status.Text=s;if(p>=96){cancel.IsEnabled=false;close.IsEnabled=false;}})),cancellation.Token);});done=true;progressView.Visibility=Visibility.Collapsed;finish.Visibility=Visibility.Visible;primary.Visibility=Visibility.Visible;primary.Content=SetupProgram.Removing?"完成":"开始学习  →";step.Text="03 / 一切就绪";cancel.Visibility=Visibility.Collapsed;close.IsEnabled=true;if(SetupProgram.Removing){finishTitle.Text="本机应用已完整卸载。";launch.Visibility=Visibility.Collapsed;}}
  catch(OperationCanceledException){MessageBox.Show("安装已取消，未提交的程序文件已清理。","ONclasstime");running=false;Close();}
  catch(Exception error){MessageBox.Show(error.Message,"暂时无法完成操作",MessageBoxButton.OK,MessageBoxImage.Warning);welcome.Visibility=Visibility.Visible;progressView.Visibility=Visibility.Collapsed;primary.Visibility=Visibility.Visible;cancel.Content="关闭";cancel.IsEnabled=true;close.IsEnabled=true;Environment.ExitCode=1;}
  finally{running=false;}
 }
}
