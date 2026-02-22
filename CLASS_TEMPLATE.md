# CLASS IMPORT TEMPLATE
<!--
This template is designed for efficient class creation. Simply paste your raw text content
into the designated sections below, then use AI to convert it into the proper JSON structure.

INSTRUCTIONS:
1. Fill in the class metadata (title, instructor, etc.)
2. Paste your content into each section following the patterns shown
3. Use AI to parse and convert to JSON format for classes.json
4. Delete example content and replace with your actual material
-->

---

## CLASS METADATA
<!-- Basic information about the class -->

**Class Number:** [e.g., 3]

**Title:** [Main class title]

**Subtitle:** [Descriptive subtitle]

**Instructor:** [Instructor name]

**Channel Name:** [e.g., class3-control]

---

## MEDIA RESOURCES
<!-- Video and audio content for the class -->

### PRIMARY VIDEO
**ID:** primary-video
**Type:** video
**Title:** Main presentation
**Primary:** true
**YouTube URL:** [Full YouTube URL]
**Pause Points (seconds):** [comma-separated list, e.g., 144, 1061, 1523]

### ADDITIONAL MEDIA (if any)
**ID:** [unique-id]
**Type:** [video/audio]
**Title:** [Media title]
**Primary:** false
**YouTube URL or Source:** [URL]
**Pause Points (seconds):** [if applicable]

---

## OUTLINE SECTIONS
<!--
Each section represents a discussion topic or lesson segment.
Copy this block for each new section.
-->

### SECTION: [Section Title/Summary]
**Section ID:** [kebab-case-id]
**Default Open:** [true/false - typically only first section is true]

**Main Points:**
- [Point 1]
- [Point 2]
- [Point 3]
- [Continue as needed]

**Discussion Questions:**

#### Q: [Question key identifier]
**Prompt:** [The actual question text to display]

**Answer:**
[Paste the full answer text here. Can include multiple paragraphs, scripture references, lists, etc.]

[Additional paragraphs as needed]

---

#### Q: [Next question key identifier]
**Prompt:** [Question text]

**Answer:**
[Answer text here]

---

[Repeat Q&A pattern for all questions in this section]

---

### SECTION: [Next Section Title]
**Section ID:** [another-kebab-case-id]
**Default Open:** false

**Main Points:**
- [Point 1]
- [Point 2]

**Discussion Questions:**

#### Q: [question-key]
**Prompt:** [Question text]

**Answer:**
[Answer text]

---

[Continue pattern for all sections...]

---

## COMMON SECTION PATTERNS
<!-- Reference patterns for typical class sections -->

### 📿 OPENING PRAYER SECTION
**Section ID:** opening-prayer
**Default Open:** true

**Main Points:**
- [What to pray for]
- [Spiritual preparation focus]
- [Set the tone for the lesson]

**Discussion Questions:**

#### Q: prayer
**Prompt:** [Prayer guidance text]

**Answer:**
[Optional answer or talking points about the prayer]

---

### 📖 SCRIPTURE FOUNDATION SECTION
**Section ID:** scripture-foundation
**Default Open:** false

**Main Points:**
- [Key passage 1 with reference]
- [Key passage 2 with reference]
- [Application or connection point]

**Discussion Questions:**

#### Q: [scripture-key]
**Prompt:** [Question about the scripture]

**Answer:**
[Biblical text and explanation]

---

### 🧠 THEOLOGICAL CONCEPTS SECTION
**Section ID:** theological-concepts
**Default Open:** false

**Main Points:**
- [Concept 1 definition]
- [Concept 2 definition]
- [How they relate to the lesson]

**Discussion Questions:**

#### Q: [concept-terminology]
**Prompt:** [Terms to define]

**Answer:**
[Term 1] - [Definition with context]

[Term 2] - [Definition with context]

[Continue for all terms]

---

### 🔍 HISTORICAL CONTEXT SECTION
**Section ID:** historical-context
**Default Open:** false

**Main Points:**
- [Historical fact or context 1]
- [Historical fact or context 2]
- [Why this matters for understanding]

**Discussion Questions:**

#### Q: [history-key]
**Prompt:** [Historical question]

**Answer:**
[Historical explanation with sources or evidence]

---

### 💭 APOLOGETICS / OBJECTIONS SECTION
**Section ID:** addressing-objections
**Default Open:** false

**Main Points:**
- [Common objection 1]
- [Common objection 2]
- [Approach to responding]

**Discussion Questions:**

#### Q: [objection-key]
**Prompt:** [The objection or challenge]

**Answer:**
[Thoughtful response addressing the concern]

[Supporting evidence or examples]

---

### 🎯 APPLICATION SECTION
**Section ID:** personal-application
**Default Open:** false

**Main Points:**
- [Practical application 1]
- [Practical application 2]
- [How to implement this week]

**Discussion Questions:**

#### Q: [application-key]
**Prompt:** [Application question]

**Answer:**
[Guidance on practical application]

[Specific action steps]

---

### 🙏 REFLECTION / CLOSING SECTION
**Section ID:** reflection-closing
**Default Open:** false

**Main Points:**
- [Reflection prompt 1]
- [Next steps or continued study]
- [Encouragement]

**Discussion Questions:**

#### Q: [reflection-key]
**Prompt:** [Reflective question]

**Answer:**
[Optional guided answer or suggestions]

---

## QUICK REFERENCE: JSON STRUCTURE MAPPING

```
METADATA →
{
  "classNumber": number,
  "title": string,
  "subtitle": string,
  "instructor": string,
  "channelName": string
}

MEDIA →
{
  "media": [
    {
      "id": string,
      "type": "video"|"audio",
      "title": string,
      "primary": boolean,
      "sources": [{"type": "youtube", "url": string}],
      "pausePoints": [number, number]
    }
  ]
}

OUTLINE →
{
  "outline": [
    {
      "id": string,
      "summary": string,
      "defaultOpen": boolean,
      "points": [string, string],
      "questions": [
        {
          "key": string,
          "prompt": string,
          "answer": string (optional)
        }
      ]
    }
  ]
}
```

---

## TIPS FOR AI CONVERSION

When using AI to convert this markdown to JSON:

1. **Section IDs:** Use kebab-case (lowercase, hyphens between words)
2. **Question Keys:** Brief identifiers (e.g., "foundations-trust", "prayer", "scripture-john")
3. **Preserving Formatting:** Maintain line breaks in answers with \n characters
4. **Empty Answers:** If an answer is blank, either omit the "answer" field or include as empty string
5. **Default Open:** Typically only first section is true
6. **Pause Points:** Convert time markers like "2:24" to seconds (144)
7. **Scripture References:** Keep formatted as shown in answer text
8. **Lists in Answers:** Use \n for line breaks in bulleted content

---

## EXAMPLE FILLED SECTION

### SECTION: Foundations and Assumptions
**Section ID:** foundations
**Default Open:** false

**Main Points:**
- Why do you personally trust the Bible? What shaped that view?
- Responding to "You only believe because you grew up with it."
- If the Bible were unreliable, what happens to your faith in Jesus?
- Objections you have heard: errors, changed over time, wrong books.

**Discussion Questions:**

#### Q: foundations-trust
**Prompt:** Why do you personally trust the Bible? What shaped that view?

**Answer:**
I didn't start out trusting the Bible, it didn't seem realistic to me and I had heard a lot of false information on it throughout my life leading me to believe that it wasn't historical, it wasn't reliable, etc. As I've studied more, learned more and adjusted my perspective - I came to see that truth in it. I've heard more about its historical reliability and I've experienced the power that it has to change not just my life - but my family's lives.

---

#### Q: foundations-objections
**Prompt:** What objections have you heard about the Bible's reliability?

**Answer:**
Common objections include:
- "The Bible has been changed so many times"
- "They picked which books to include based on politics"
- "It's full of contradictions and errors"
- "It's just mythology like other ancient texts"

Each of these deserves a thoughtful response based on historical and textual evidence.

---

## YOUR CLASS CONTENT STARTS HERE
<!-- Replace everything below with your actual class content -->

### SECTION:
**Section ID:**
**Default Open:**

**Main Points:**
-
-
-

**Discussion Questions:**

#### Q:
**Prompt:**

**Answer:**


---
