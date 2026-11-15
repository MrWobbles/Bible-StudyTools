import type { EditorDocument } from '../types';

export function getNoteStarterTemplate(note: EditorDocument): string {
  return `
    <h1>${note.title || 'Untitled Note'}</h1>
    <p>Start writing your notes here...</p>
  `;
}

export function getSampleContent(): string {
  return `
        <h1>How do we trust scripture?</h1>

        <h2>1. What warning is repeated across these passages?</h2>

        <p>Pay attention to the language of adding, taking away, commands, words, and authority.</p>

        <h3>Proverbs 30:5–6 NKJV</h3>

        <blockquote>
            <p><em>Every word of God is pure;</em></p>
            <p><em>He is a shield to those who put their trust in Him.</em></p>
            <p><em>Do not add to His words,</em></p>
            <p><em>Lest He rebuke you, and you be found a liar.</em></p>
        </blockquote>

        <h3>A — Every word of God is pure</h3>

        <p>The words that we have are correct and accurate, they are truth. Too many times in our culture in order to tear down Scripture people will pull out verses, they will take them out of context and accuse God of being unloving, unjust, or contradictory - but anytime they do this, when we are properly prepared, we can put the verse back into context and show the purity of the word in all cases.</p>

        <p>God's Word is not something that will break under pressure - God invites doubt and intense study because <strong>truth is not afraid of the light</strong>.</p>

        <h4>Examples:</h4>

        <p><strong>Verse: Elisha and the Bears (2 Kings 2:23-25)</strong></p>

        <h5>2 Kings 2:23–25 NKJV</h5>

        <blockquote>
            <p>Then he went up from there to Bethel; and as he was going up the road, some youths came from the city and mocked him, and said to him, "Go up, you baldhead! Go up, you baldhead!"</p>
            <p>So he turned around and looked at them, and pronounced a curse on them in the name of the Lord. And two female bears came out of the woods and mauled forty-two of the youths.</p>
            <p>Then he went from there to Mount Carmel, and from there he returned to Samaria.</p>
        </blockquote>

        <p><strong>Criticism:</strong> 42 children were mauled by God just because they made fun of this prophet for being bald - that doesn't seem like a very forgiving thing to do...</p>
    `;
}

export function getStarterTemplate(cls: EditorDocument): string {
  return `
        <h1>${cls.title || 'Class Title'}</h1>

        <h2>${cls.subtitle || 'Subtitle'}</h2>

        <p>Welcome to this Bible study class. Begin creating your lesson content here.</p>

        <h3>Key Topics</h3>
        <ul>
            <li>Topic 1</li>
            <li>Topic 2</li>
            <li>Topic 3</li>
        </ul>

        <h3>Discussion Questions</h3>
        <ol>
            <li>Question 1?</li>
            <li>Question 2?</li>
        </ol>

        <p>Start adding your content using the toolbar above. You can format text, add Bible references, images, and more!</p>
    `;
}
