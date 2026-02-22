/**
 * Icon Helper - Replaces emoticons with Material Symbols icons
 * Uses Google Material Icons for consistent, scalable icons
 */

// Icon mappings
const ICON_MAP = {
    check: 'check_circle',
    hourglass: 'hourglass_bottom',
    warning: 'warning',
    lightbulb: 'lightbulb',
    timer: 'schedule',
    book: 'menu_book',
    question: 'help',
    note: 'note',
    image: 'image',
    speaker: 'volume_up',
    clipboard: 'description',
    link: 'link',
    chart: 'bar_chart',
    folder: 'folder',
    play: 'play_arrow',
    lock: 'lock',
    money: 'paid',
    rocket: 'rocket',
    sparkles: 'stars',
    lightning: 'bolt',
    video: 'videocam',
    audio: 'audio_file',
    pdf: 'picture_as_pdf',
    document: 'description',
    presentation: 'slideshow',
    code: 'code'
};

/**
 * Get HTML for a Material Symbol icon
 * @param {string} iconName - Icon name (key from ICON_MAP)
 * @param {object} options - Options for icon rendering
 * @returns {string} - HTML string with icon
 */
function getIconHTML(iconName, options = {}) {
    const {
        size = '1em',
        className = 'material-symbols-outlined',
        style = '',
        fill = false
    } = options;
    
    const icon = ICON_MAP[iconName] || iconName;
    const fillClass = fill ? 'fill' : '';
    const customStyle = style ? `style="${style}"` : '';
    
    return `<span class="${className} ${fillClass}" ${customStyle} style="font-size: ${size}; vertical-align: middle;">${icon}</span>`;
}

/**
 * Get icon name for media type
 * @param {string} type - Media type (video, audio, image, etc)
 * @returns {string} - Icon name
 */
function getMediaIcon(type) {
    const iconMap = {
        video: 'videocam',
        audio: 'audio_file',
        images: 'image',
        image: 'image',
        pdf: 'picture_as_pdf',
        document: 'description',
        link: 'link',
        presentation: 'slideshow'
    };
    return iconMap[type] || 'folder';
}

/**
 * Get icon name for point type in teaching
 * @param {string} type - Point type (verse, question, example, note, etc)
 * @returns {string} - Icon name
 */
function getPointIcon(type) {
    const iconMap = {
        verse: 'menu_book',
        question: 'help',
        example: 'lightbulb',
        note: 'note',
        heading: '',
        point: 'check_circle'
    };
    return iconMap[type] || 'check_circle';
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getIconHTML,
        getMediaIcon,
        getPointIcon,
        ICON_MAP
    };
} else {
    // Browser environment - expose to window
    window.getIconHTML = getIconHTML;
    window.getMediaIcon = getMediaIcon;
    window.getPointIcon = getPointIcon;
    window.ICON_MAP = ICON_MAP;
}
