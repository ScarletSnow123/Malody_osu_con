# FAQ

## Double-clicking a `.bat` flashes a black window and nothing happens

Usually Node.js isn't installed, or `cli.mjs` isn't in the same folder. The script shows a
dialog; you can also run `命令行.bat` to see the actual error.

## `GUI.bat` doesn't respond

Wait 1–2 seconds; if it still doesn't, antivirus is probably blocking the PowerShell script
— whitelist the folder, or use `OsuToMalody.html`.

## Antivirus flags it

`.bat` + `.ps1` + PowerShell is a common false-positive pattern. You can use only
`OsuToMalody.html`, which never touches PowerShell.

## Can't find the output

GUI / drag-drop default to the **desktop**; the web app uses the **browser download folder**.
In the GUI you can click "Open output folder".

## The source file disappeared after importing into Malody

Normal Malody behaviour (import deletes the source). Regenerate with the same steps if
needed.

## The 7K difficulty isn't visible after import

Malody 4.x **pages the song list by key count**; switch to the 7K page. It's not a failed
import.

## The result plays uniformly early/late

Toggle "Audio sync via Malody offset" (CLI: `--no-sync`).

## A particular Malody version can't read the output

Switch "Output style" to "Minimal" (CLI: `--mc-style minimal`) and retry.

## The web app downloads several files at once and the browser asks for permission

Click "Allow multiple files". This is a browser setting, not a converter bug.

## Do I need an internet connection?

No. Everything runs locally and offline — the web app never uploads any file.

## Can I convert an entire osu! library in one go?

Use the command line: `node cli.mjs "D:\osu!\Songs" -r -o "D:\converted"`. The web app
is **not** for this — it would merge all `.osu` files into one `.mcz`.

---

Chinese version: [`faq.zh-CN.md`](faq.zh-CN.md)
