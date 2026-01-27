# Emoji Replacement

## 1. RegExp

### 1.1 Main RegExp
- Get RegExp:  
  https://github.com/mathiasbynens/emoji-test-regex-pattern/blob/main/dist/emoji-17.0/javascript.txt
- Replace RegExp in `regex.ts` by wrapping it with `(` and `)`

### 1.2 Deprecated RegExp
- Get RegExp:  
  https://github.com/twitter/twemoji-parser/blob/master/src/lib/regex.js
- Format it using `format_emoji_regex.js`
- Replace RegExp in `regex.ts` with the result from `out/emoji_regex.txt`

---

## 2. Images
- Get images:  
  https://github.com/iamcal/emoji-data/tree/master/img-apple-64
- Download using:  
  https://download-directory.github.io
- Truncate `-fe0f` from filenames:
  ```bash
  for f in *.png; do mv "$f" "$(echo "$f" | sed s/-fe0f//g)"; done
  ```

---

## 3. Scheme

- Get emoji scheme: https://raw.githubusercontent.com/iamcal/emoji-data/master/emoji_pretty.json  
- Place it in `in/emoji_pretty.json`  
- Format with `format_jsons`  
- Replace emojis in `config.ts` with result from `out/emoji.json`  
- Add version in `emojiVersionsSupport.ts`
