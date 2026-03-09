# -------------------------------------------------------------------
# CONFIGURATION – change these values as needed
# -------------------------------------------------------------------
$baseUrl   = "http://localhost:3000"
$email     = "testuser@example.com"   # use a unique email each test
$password  = "123456"
$name      = "Test User"

# -------------------------------------------------------------------
# Helper function to pretty‑print JSON responses
# -------------------------------------------------------------------
function Print-Response($response) {
    if ($response -is [string]) {
        Write-Host $response
    } else {
        $response | ConvertTo-Json -Depth 10
    }
}

# -------------------------------------------------------------------
# 1. REGISTER (optional – skip if user already exists)
# -------------------------------------------------------------------
Write-Host "`n[1] REGISTERING NEW USER..." -ForegroundColor Cyan
$registerBody = @{
    email    = $email
    password = $password
    name     = $name
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerBody
    Write-Host "REGISTRATION SUCCESSFUL:" -ForegroundColor Green
    Print-Response $registerResponse
} catch {
    Write-Host "Registration failed (maybe user already exists): $($_.Exception.Message)" -ForegroundColor Yellow
}

# -------------------------------------------------------------------
# 2. LOGIN – get access & refresh tokens
# -------------------------------------------------------------------
Write-Host "`n[2] LOGGING IN..." -ForegroundColor Cyan
$loginBody = @{
    email    = $email
    password = $password
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$accessToken  = $loginResponse.accessToken
$refreshToken = $loginResponse.refreshToken

Write-Host "LOGIN SUCCESSFUL" -ForegroundColor Green
Write-Host "Access token : $accessToken"
Write-Host "Refresh token: $refreshToken"

# -------------------------------------------------------------------
# 3. GET ONBOARDING STATUS
# -------------------------------------------------------------------
Write-Host "`n[3] CHECKING ONBOARDING STATUS..." -ForegroundColor Cyan
$statusResponse = Invoke-RestMethod -Uri "$baseUrl/onboarding/status" `
    -Method GET `
    -Headers @{ Authorization = "Bearer $accessToken" }

Write-Host "Onboarding status:" -ForegroundColor Green
Print-Response $statusResponse

# -------------------------------------------------------------------
# 4. SUBMIT QUESTIONNAIRE
# -------------------------------------------------------------------
Write-Host "`n[4] SUBMITTING QUESTIONNAIRE..." -ForegroundColor Cyan
$questionnaireBody = @{
    objectiveType          = "career"
    lockdownIntensity      = "medium"
    preferredFocusTime     = "morning"
    socialAccountability   = "high"
} | ConvertTo-Json

$questionnaireResponse = Invoke-RestMethod -Uri "$baseUrl/onboarding/questionnaire" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" } `
    -ContentType "application/json" `
    -Body $questionnaireBody

Write-Host "Questionnaire response:" -ForegroundColor Green
Print-Response $questionnaireResponse

# -------------------------------------------------------------------
# 5. UPDATE GOAL
# -------------------------------------------------------------------
Write-Host "`n[5] UPDATING GOAL..." -ForegroundColor Cyan
$goalBody = @{
    currentObjectiveText = "Become a backend expert"
} | ConvertTo-Json

$goalResponse = Invoke-RestMethod -Uri "$baseUrl/onboarding/goal" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" } `
    -ContentType "application/json" `
    -Body $goalBody

Write-Host "Goal update response:" -ForegroundColor Green
Print-Response $goalResponse

# -------------------------------------------------------------------
# 6. COMPLETE ONBOARDING
# -------------------------------------------------------------------
Write-Host "`n[6] COMPLETING ONBOARDING..." -ForegroundColor Cyan
$completeResponse = Invoke-RestMethod -Uri "$baseUrl/onboarding/complete" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" }

Write-Host "Complete onboarding response:" -ForegroundColor Green
Print-Response $completeResponse

# -------------------------------------------------------------------
# 7. REFRESH TOKEN (get a new access token)
# -------------------------------------------------------------------
Write-Host "`n[7] REFRESHING ACCESS TOKEN..." -ForegroundColor Cyan
$refreshBody = @{
    refreshToken = $refreshToken
} | ConvertTo-Json

$refreshResponse = Invoke-RestMethod -Uri "$baseUrl/auth/refresh" `
    -Method POST `
    -ContentType "application/json" `
    -Body $refreshBody

Write-Host "New tokens received:" -ForegroundColor Green
Print-Response $refreshResponse

# -------------------------------------------------------------------
# 8. (Optional) Use new token to call a protected endpoint again
# -------------------------------------------------------------------
Write-Host "`n[8] CHECKING STATUS WITH NEW TOKEN..." -ForegroundColor Cyan
$newAccessToken = $refreshResponse.accessToken
$newStatus = Invoke-RestMethod -Uri "$baseUrl/onboarding/status" `
    -Method GET `
    -Headers @{ Authorization = "Bearer $newAccessToken" }

Write-Host "Onboarding status (using new token):" -ForegroundColor Green
Print-Response $newStatus

Write-Host "`n*** ALL TESTS COMPLETED ***" -ForegroundColor Magenta