# Markdown Display Test File

This file is a comprehensive Markdown sample for testing rendering behavior.

## Table of Contents

- [Headings](#headings)
- [Text Styles](#text-styles)
- [Blockquotes](#blockquotes)
- [Lists](#lists)
- [Code](#code)
- [Links](#links)
- [Images](#images)
- [Tables](#tables)
- [Task Lists](#task-lists)
- [Rules and Breaks](#rules-and-breaks)
- [Escaping Characters](#escaping-characters)
- [Footnotes](#footnotes)
- [Inline HTML](#inline-html)
- [Definition Lists (renderer-dependent)](#definition-lists-renderer-dependent)
- [Math (renderer-dependent)](#math-renderer-dependent)
- [Diagram Blocks (renderer-dependent)](#diagram-blocks-renderer-dependent)
- [Edge Cases](#edge-cases)

---

## Headings

# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading

## Text Styles

Plain text paragraph with normal sentence flow.

**Bold text**

__Bold text with underscores__

*Italic text*

_Italic text with underscores_

***Bold + italic***

~~Strikethrough~~

`Inline code`

Combination: **bold**, *italic*, ~~strike~~, and `code` in one line.

HTML-based styles (depends on renderer support):

- H<sub>2</sub>O using subscript
- E = mc<sup>2</sup> using superscript
- <mark>Highlighted text using HTML mark</mark>

## Blockquotes

> Single-level blockquote.

> Multi-line blockquote:
> This is line 1.
> This is line 2.

> Quote with formatting: **bold**, *italic*, and `code`.

## Lists

### Unordered Lists

- Item A
- Item B
- Item C

* Item using asterisk
* Another asterisk item

+ Item using plus
+ Another plus item

### Ordered Lists

1. First item
2. Second item
3. Third item

1. Numbering can restart at 1
1. Many parsers auto-increment
1. Final item

### Mixed and Nested Lists

1. Top-level ordered item
2. Top-level ordered item
- Nested unordered under ordered
- Another nested unordered
1. Nested ordered under unordered
2. Nested ordered second item
3. Back to top-level ordered

- Top-level unordered
1. Nested ordered
2. Nested ordered second
- Back to unordered

## Code

### Fenced Code Block (no language)

```
This is a plain fenced code block.
Special chars: < > & * _ `
```

### Fenced Code Block (language: javascript)

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet("Markdown");
```

### Fenced Code Block (language: python)

```python
def fib(n):
    a, b = 0, 1
    out = []
    while len(out) < n:
        out.append(a)
        a, b = b, a + b
    return out

print(fib(8))
```

### Indented Code Block

    This is an indented code block.
    It starts with four spaces.

## Links

Inline link: [Google](https://google.com)

Autolink URL: <https://example.com/path?query=1&lang=en>

Autolink email: <test@example.com>

Reference-style link: [Search Engine][search]

[search]: https://duckduckgo.com "DuckDuckGo"

Link with title: [Markdown Guide](https://www.markdownguide.org "Markdown Guide")

Relative link (for app routing tests): [Local Path](./docs/getting-started.md)

## Tables

| Column A | Column B | Column C |
| --- | --- | --- |
| Text | **Bold** | `Code` |
| Left | Center | Right |
| Multi word | With [link](https://example.com) | ~~Strikethrough~~ |

Alignment table:

| Left Align | Center Align | Right Align |
| :--- | :---: | ---: |
| apple | middle | 10 |
| banana | center | 200 |
| cherry | aligned | 3000 |

## Task Lists

- [x] Completed task
- [ ] Incomplete task
- [x] Completed with `inline code`
- [ ] Pending with [link](https://example.com)

1. [x] Completed task
2. [ ] Incomplete task
3. [x] Completed with `inline code`
4. [ ] Pending with [link](https://example.com)

## Rules and Breaks

Paragraph above first rule.

---

Paragraph above second rule.

***

Paragraph above third rule.

___

Line break test (two spaces at end of line):  
This should be on a new line.

HTML line break test:<br>
This should also be on a new line.

## Escaping Characters

Literal asterisks: \*not italic\*

Literal underscores: \_not italic\_

Literal backticks: \`not code\`

Literal brackets: \[not a link\]

Literal hash: \# not a heading

Literal pipe in table-like text: A \| B

## Footnotes

Footnote reference one.[^1]

Footnote reference two with more text.[^long-note]

[^1]: This is footnote number one.
[^long-note]: This is a longer footnote with **formatting**, `code`, and a [link](https://example.com).

## Inline HTML

<div>
  <strong>HTML block content</strong>
  <p>This paragraph is inside a div element.</p>
</div>

<details>
  <summary>Click to expand details/summary block</summary>
  Hidden content inside details. Useful for testing collapsible sections.
</details>

## Definition Lists (renderer-dependent)

Term 1
: Definition for term 1

Term 2
: First definition for term 2
: Second definition for term 2

## Math (renderer-dependent)

Inline math style: $a^2 + b^2 = c^2$

Block math style:

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Edge Cases

Empty emphasis markers:

****

Long line test:

ThisIsALongUnbrokenStringToTestWrappingBehavior_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_abcdefghijklmnopqrstuvwxyz_0123456789

Unicode test:

- Accents: cafe, naive, fiance
- Cyrillic: primer teksta
- Greek: alpha beta gamma

Backslash at end of line test:\

HTML comment should be hidden in some renderers:

<!-- Hidden comment: markdown-renderer-test -->
