# Publish Amplify Frontend Release — Project Skill

This skill commits and pushes frontend changes to trigger an automatic AWS Amplify deployment.
Amplify is connected to the `main` branch — every push to `main` triggers a new frontend release.

---

## STEP 1 — Get commit message

Ask the developer:

```
What is your commit message?
(e.g. "add Bizum payment method", "fix card tokenizer layout", "update theme colours")
```

If a message was already passed as an argument to the skill, skip this question and use it directly.

---

## STEP 2 — Check current branch

Run:
```bash
git branch --show-current
```

Then follow the path below based on the result.

---

## PATH A — Already on `main`

Run these commands in sequence:

```bash
git add .
git commit -m "<the commit message>"
git push origin main
```

After push, confirm:
```
✅ Pushed to main. AWS Amplify will now build and deploy the frontend automatically.
   Monitor progress at: AWS Amplify Console → flowDemoLambdaSyed app → Deployments tab.
```

---

## PATH B — On a feature branch

Run these commands in sequence:

```bash
# 1. Stage and commit current work on the feature branch
git add .
git commit -m "<the commit message>"

# 2. Switch to main and merge
git checkout main
git merge <feature-branch-name> --no-edit

# 3. Push main to trigger Amplify
git push origin main
```

After push, confirm:
```
✅ Merged <branch-name> into main and pushed.
   AWS Amplify will now build and deploy the frontend automatically.
   Monitor progress at: AWS Amplify Console → flowDemoLambdaSyed app → Deployments tab.
```

---

## STEP 3 — Handle edge cases

**Nothing to commit (working tree clean):**
```
ℹ️  Nothing to commit — working tree is clean.
   If you want to force a re-deploy, you can push without changes or trigger a manual redeploy in the Amplify Console.
```

**Merge conflict:**
```
⚠️  Merge conflict detected. Resolve the conflicts manually, then re-run this skill.
   Conflicting files are listed above.
```

**Push rejected (remote has changes not in local):**
```bash
git pull origin main --rebase
git push origin main
```
Only do this if the pull is safe (no force push). Inform the developer before running.

---

## IMPORTANT REMINDERS

- This skill ONLY deploys the **frontend** (the `frontend/` folder via AWS Amplify).
- **Backend Lambda changes are NOT deployed by this skill.** Lambda must be deployed separately by zipping and uploading `amplify/backend/function/flowDemoLambdaSyed/src/` via the AWS Console.
- If you added a new backend route, remind the developer:
  ```
  ⚠️  Remember: new backend routes also need to be added manually in AWS API Gateway.
      This push only deploys the frontend.
  ```
