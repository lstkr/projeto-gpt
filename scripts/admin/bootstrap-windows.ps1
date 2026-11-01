param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z]{20}$')]
    [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'
$previousEncoding = $OutputEncoding
$payload = @{}
$bootstrapExitCode = 1

# O console do PowerShell lê os segredos; somente o pipe recebe texto em memória.
function Read-ProtectedValue([string]$Label) {
    $protectedValue = Read-Host -Prompt $Label -AsSecureString
    try {
        return ([System.Net.NetworkCredential]::new('', $protectedValue)).Password
    } finally {
        $protectedValue.Dispose()
    }
}

try {
    do {
        $payload.connectionString = Read-ProtectedValue 'URL PostgreSQL (entrada protegida)'
        if ([string]::IsNullOrWhiteSpace($payload.connectionString)) {
            Write-Host 'Entrada vazia. Cole a URI antes de pressionar Enter.'
        }
    } while ([string]::IsNullOrWhiteSpace($payload.connectionString))
    $payload.password = Read-ProtectedValue 'Senha provisoria do DBA'
    $payload.confirmation = Read-ProtectedValue 'Repita a senha provisoria'
    # WinPS 5.1 usa ASCII por padrão no pipe; preserve senhas UTF-8 sem mudar o sistema.
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    ConvertTo-Json -InputObject $payload -Compress |
        & node (Join-Path $PSScriptRoot 'bootstrap.mjs') $ProjectRef '--protected-stdin'
    $bootstrapExitCode = $LASTEXITCODE
} catch {
    # Exceções do host podem carregar entradas; não imprima o objeto recebido.
    [Console]::Error.WriteLine('Entrada protegida interrompida. Confira o terminal e a instalacao do Node.')
} finally {
    $payload.Clear()
    $OutputEncoding = $previousEncoding
}
exit $bootstrapExitCode
