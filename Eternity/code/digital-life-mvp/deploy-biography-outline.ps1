# Biography Outline Feature - Quick Deploy Script
# Run this script to deploy the biography outline feature

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Biography Outline Feature Deploy" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Supabase CLI is installed
Write-Host "[1/4] Checking Supabase CLI..." -ForegroundColor Yellow
$supabaseCheck = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCheck) {
    Write-Host "ERROR: Supabase CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "Visit: https://supabase.com/docs/guides/cli" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Supabase CLI found" -ForegroundColor Green
Write-Host ""

# Step 2: Run migration
Write-Host "[2/4] Running database migration..." -ForegroundColor Yellow
Write-Host "Note: You may need to apply the migration via Supabase Dashboard if this fails." -ForegroundColor Gray
Write-Host "Migration file: supabase/migrations/20241224_biography_outlines.sql" -ForegroundColor Gray
Write-Host ""
$migrateConfirm = Read-Host "Apply migration now? (y/n)"
if ($migrateConfirm -eq 'y') {
    try {
        supabase db push
        Write-Host "✓ Migration applied" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Migration may have failed. Please check manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "⊘ Skipped migration. Apply manually via Dashboard." -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Set secrets
Write-Host "[3/4] Configuring Edge Function secrets..." -ForegroundColor Yellow
$geminiKey = Read-Host "Enter your GEMINI_API_KEY (or press Enter to skip)"
if ($geminiKey) {
    try {
        supabase secrets set GEMINI_API_KEY=$geminiKey
        Write-Host "✓ GEMINI_API_KEY configured" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Failed to set secret. Please set manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "⊘ Skipped secret configuration. Set manually with:" -ForegroundColor Yellow
    Write-Host "   supabase secrets set GEMINI_API_KEY=your_key_here" -ForegroundColor Gray
}
Write-Host ""

# Step 4: Deploy Edge Function
Write-Host "[4/4] Deploying Edge Function..." -ForegroundColor Yellow
$deployConfirm = Read-Host "Deploy generate_biography_outline function? (y/n)"
if ($deployConfirm -eq 'y') {
    try {
        supabase functions deploy generate_biography_outline
        Write-Host "✓ Edge Function deployed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Deployment may have failed. Check logs with:" -ForegroundColor Yellow
        Write-Host "   supabase functions logs generate_biography_outline" -ForegroundColor Gray
    }
} else {
    Write-Host "⊘ Skipped deployment. Deploy manually with:" -ForegroundColor Yellow
    Write-Host "   supabase functions deploy generate_biography_outline" -ForegroundColor Gray
}
Write-Host ""

# Summary
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Deployment Summary" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor White
Write-Host "1. Verify tables created in Supabase Dashboard" -ForegroundColor Gray
Write-Host "2. Test the function with >= 100 completed answers" -ForegroundColor Gray
Write-Host "3. Check Edge Function logs for any errors" -ForegroundColor Gray
Write-Host "4. Review BIOGRAPHY_OUTLINE_DEPLOYMENT.md for details" -ForegroundColor Gray
Write-Host ""
Write-Host "Testing Commands:" -ForegroundColor White
Write-Host "  View function logs: supabase functions logs generate_biography_outline --tail" -ForegroundColor Gray
Write-Host "  Check DB tables: Query 'biography_outlines' and 'outline_jobs' in Dashboard" -ForegroundColor Gray
Write-Host ""
Write-Host "Done! 🎉" -ForegroundColor Green
