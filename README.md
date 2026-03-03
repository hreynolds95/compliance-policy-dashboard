# Compliance Dashboard

Static dashboard for compliance policy and standards groupings.

## Local run

```bash
cd "/Users/hreynolds/Documents/New project"
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`.

## Files deployed

- `index.html`
- `styles.css`
- `app.js`
- `local_data.js`
- `compliance_inventory.csv`

## Publish to GitHub Pages

1. Create an empty GitHub repository.
2. Add your remote and push:

```bash
cd "/Users/hreynolds/Documents/New project"
git add .
git commit -m "Add compliance dashboard and Pages deploy workflow"
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

3. In GitHub:
- Go to `Settings` -> `Pages`.
- Set **Source** to **GitHub Actions**.

After that, every push to `main` redeploys automatically.
