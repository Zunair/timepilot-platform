param(
  [string]$DatabaseUrl,
  [string]$OrgName = "Acme Demo",
  [string]$OrgSlug = "acme",
  [string]$UserEmail = "demo@acme.com",
  [string]$FirstName = "Demo",
  [string]$LastName = "User",
  [string]$Timezone = "America/New_York",
  [int]$DaysAhead = 60
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "[seed-demo] $Message"
}

function Resolve-DatabaseUrl {
  param([string]$ExplicitDatabaseUrl)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitDatabaseUrl)) {
    return $ExplicitDatabaseUrl
  }

  if (-not (Test-Path ".env")) {
    throw "DATABASE_URL was not provided and .env was not found in the current directory."
  }

  $line = Select-String -Path ".env" -Pattern '^DATABASE_URL=' | Select-Object -First 1
  if (-not $line) {
    throw "DATABASE_URL was not found in .env."
  }

  return $line.Line.Substring("DATABASE_URL=".Length)
}

function Require-Command {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found on PATH."
  }
}

function Escape-SqlLiteral {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  return $Value.Replace("'", "''")
}

if ($DaysAhead -lt 1) {
  throw "DaysAhead must be at least 1."
}

Require-Command -CommandName "psql"

$dbUrl = Resolve-DatabaseUrl -ExplicitDatabaseUrl $DatabaseUrl
Write-Step "Using database URL from parameter/.env"

$orgNameSql = Escape-SqlLiteral -Value $OrgName
$orgSlugSql = Escape-SqlLiteral -Value $OrgSlug
$userEmailSql = Escape-SqlLiteral -Value $UserEmail
$firstNameSql = Escape-SqlLiteral -Value $FirstName
$lastNameSql = Escape-SqlLiteral -Value $LastName
$timezoneSql = Escape-SqlLiteral -Value $Timezone

$sql = @"
DO `$$
DECLARE
  v_org_id  UUID;
  v_user_id UUID;
BEGIN
  INSERT INTO organizations (name, slug)
  VALUES ('$orgNameSql', '$orgSlugSql')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_org_id;

  INSERT INTO users (email, first_name, last_name)
  VALUES ('$userEmailSql', '$firstNameSql', '$lastNameSql')
  ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name
  RETURNING id INTO v_user_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM availabilities
  WHERE organization_id = v_org_id AND user_id = v_user_id;

  INSERT INTO availabilities
    (organization_id, user_id, type, start_time, end_time, days_of_week, buffer_minutes, timezone)
  SELECT
    v_org_id,
    v_user_id,
    'week',
    (d::date AT TIME ZONE '$timezoneSql' + INTERVAL '9 hours'),
    (d::date AT TIME ZONE '$timezoneSql' + INTERVAL '17 hours'),
    ARRAY[EXTRACT(DOW FROM d)::int],
    0,
    '$timezoneSql'
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '$DaysAhead days', INTERVAL '1 day') AS d
  WHERE EXTRACT(DOW FROM d) IN (1, 2, 3, 4, 5);

  RAISE NOTICE 'seeded org_slug=% org_id=% user_email=% user_id=% timezone=% days_ahead=%',
    '$orgSlugSql', v_org_id, '$userEmailSql', v_user_id, '$timezoneSql', $DaysAhead;
END `$$;
"@

$tempSqlPath = Join-Path $env:TEMP "timepilot-seed-demo.sql"
Set-Content -Path $tempSqlPath -Value $sql -Encoding UTF8

Write-Step "Seeding demo org/user/availability..."
psql "$dbUrl" -f $tempSqlPath

Write-Step "Done."
Write-Step "Booking URL: http://localhost:3001/?org=$OrgSlug&user=<user-id-uuid>"
Write-Step "Get user UUID with: psql $dbUrl -c ""SELECT id FROM users WHERE email = '$UserEmail';"""
