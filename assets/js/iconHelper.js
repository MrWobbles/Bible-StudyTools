"use strict";
/**
 * Icon Helper - Replaces emoticons with Material Symbols icons
 * Uses Google Material Icons for consistent, scalable icons
 */
(function () {
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
    const MEDIA_ICON_MAP = {
        video: 'videocam',
        audio: 'audio_file',
        images: 'image',
        image: 'image',
        pdf: 'picture_as_pdf',
        document: 'description',
        link: 'link',
        presentation: 'slideshow'
    };
    const POINT_ICON_MAP = {
        verse: 'menu_book',
        question: 'help',
        example: 'lightbulb',
        note: 'note',
        heading: '',
        point: 'check_circle'
    };
    /**
     * Get HTML for a Material Symbol icon.
     */
    function getIconHTML(iconName, options = {}) {
        const { size = '1em', className = 'material-symbols-outlined', style = '', fill = false } = options;
        const icon = ICON_MAP[iconName] || iconName;
        const fillClass = fill ? 'fill' : '';
        const customStyle = style ? `style="${style}"` : '';
        return `<span class="${className} ${fillClass}" ${customStyle} style="font-size: ${size}; vertical-align: middle;">${icon}</span>`;
    }
    /**
     * Get icon name for media type.
     */
    function getMediaIcon(type) {
        return MEDIA_ICON_MAP[type] || 'folder';
    }
    /**
     * Get icon name for point type in teaching.
     */
    function getPointIcon(type) {
        return POINT_ICON_MAP[type] ?? 'check_circle';
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getIconHTML,
            getMediaIcon,
            getPointIcon,
            ICON_MAP
        };
    }
    else {
        window.getIconHTML = getIconHTML;
        window.getMediaIcon = getMediaIcon;
        window.getPointIcon = getPointIcon;
        window.ICON_MAP = { ...ICON_MAP };
    }
})();
