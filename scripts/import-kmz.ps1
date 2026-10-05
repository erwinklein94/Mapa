param([string]$InputFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($InputFile)
try {
  $entry=$archive.Entries | Where-Object FullName -eq 'doc.kml'
  $reader=[IO.StreamReader]::new($entry.Open())
  try { [xml]$doc=$reader.ReadToEnd() } finally {$reader.Dispose()}
} finally {$archive.Dispose()}
$ns=[Xml.XmlNamespaceManager]::new($doc.NameTable)
$ns.AddNamespace('k','http://www.opengis.net/kml/2.2')
$i=0
$points=@($doc.SelectNodes('//k:Placemark[k:Point]',$ns) | ForEach-Object {
  $i++; $c=$_.Point.coordinates.Trim().Split(','); $name=[string]$_.name
  $parts=$name -split ' - ',2
  @{id=('kmz-'+$i);name=$name;yard=$parts[0];source_km=$(if($parts.Count -gt 1){$parts[1]}else{''});lat=[double]::Parse($c[1],[cultureinfo]::InvariantCulture);lng=[double]::Parse($c[0],[cultureinfo]::InvariantCulture)}
})
$out=Join-Path $PSScriptRoot '../dist/assets/rail-points.json'
$points | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $out -Encoding utf8
Write-Output ('Imported points: '+$points.Count)
