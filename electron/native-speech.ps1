param([ValidateSet('zh-CN','en-US')][string]$Language='zh-CN')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
try {
 Add-Type -AssemblyName System.Speech
 $recognizers=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
 $match=$recognizers | Where-Object {$_.Culture.Name -eq $Language} | Select-Object -First 1
 if(-not $match){throw "No installed Windows speech recognizer for $Language. Install the Windows speech language pack."}
 $engine=New-Object System.Speech.Recognition.SpeechRecognitionEngine($match)
 $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
 $engine.SetInputToDefaultAudioDevice()
 Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier recognized -Action {
  [Console]::Out.WriteLine((@{type='final';text=$EventArgs.Result.Text;confidence=$EventArgs.Result.Confidence} | ConvertTo-Json -Compress))
 } | Out-Null
 Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier partial -Action {
  [Console]::Out.WriteLine((@{type='partial';text=$EventArgs.Result.Text} | ConvertTo-Json -Compress))
 } | Out-Null
 $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
 [Console]::Out.WriteLine('{"type":"ready"}')
 while($true){Wait-Event -Timeout 1 | Out-Null}
} catch {
 [Console]::Out.WriteLine((@{type='error';message=$_.Exception.Message} | ConvertTo-Json -Compress))
 exit 1
} finally {if($engine){$engine.RecognizeAsyncCancel();$engine.Dispose()}}
