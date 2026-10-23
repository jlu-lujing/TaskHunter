import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { decorateMarkdown } from '../markdown/decorate';
import { buildTurnImageExportSource, cloneMessageImageExportSource, MESSAGE_IMAGE_EXPORT_EXCLUDE_ATTRIBUTE } from './imageExport';

Object.assign(globalThis, { document: new Window().document });

describe('message image export', () => {
    test('marks external-link favicons as export-only decoration', () => {
        const source = document.createElement('div');
        source.innerHTML = '<p><a href="https://example.com/docs">Documentation</a></p>';

        decorateMarkdown(source, {
            labels: {
                copy: 'Copy',
                copied: 'Copied',
                enableCodeWrap: 'Wrap',
                disableCodeWrap: 'Do not wrap',
                enableTableWrap: 'Wrap cells',
                disableTableWrap: 'Do not wrap cells',
                copyTable: 'Copy table',
                downloadTable: 'Download table',
                copyDiagram: 'Copy diagram',
                downloadDiagram: 'Download diagram',
                zoomInDiagram: 'Zoom in',
                zoomOutDiagram: 'Zoom out',
                resetDiagramView: 'Reset',
                previewLabel: 'Preview',
                previewTitle: 'Preview',
            },
            mermaidControls: { download: false, copy: false, showPanZoomControls: false },
            codeBlockLineWrap: false,
            tableCellWrap: false,
            renderMermaid: () => ({}),
        });

        const favicon = source.querySelector(`span[${MESSAGE_IMAGE_EXPORT_EXCLUDE_ATTRIBUTE}="true"] > img`);
        expect(favicon?.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/example.com.ico');
    });

    test('omits marked decoration from the clone without removing content or mutating the source', () => {
        const source = document.createElement('div');
        source.innerHTML = `
            <span ${MESSAGE_IMAGE_EXPORT_EXCLUDE_ATTRIBUTE}="true">
                <img src="https://icons.duckduckgo.com/ip3/example.com.ico" alt="">
            </span>
            <p>Message content</p>
            <img src="data:image/png;base64,content" alt="Message image">
        `;

        const clone = cloneMessageImageExportSource(source);

        expect(Boolean(clone.querySelector(`[${MESSAGE_IMAGE_EXPORT_EXCLUDE_ATTRIBUTE}="true"]`))).toBe(false);
        expect(Boolean(clone.querySelector('img[src^="https://icons.duckduckgo.com/"]'))).toBe(false);
        expect(clone.textContent).toContain('Message content');
        expect(Boolean(clone.querySelector('img[alt="Message image"]'))).toBe(true);
        expect(Boolean(source.querySelector(`[${MESSAGE_IMAGE_EXPORT_EXCLUDE_ATTRIBUTE}="true"]`))).toBe(true);
    });
});

describe('turn image export', () => {
    test('draws every text part of the turn in order, with the chat\'s code block frame and colours', async () => {
        // Stands in for the chat's Markdown pipeline, which needs the highlight worker.
        const renderMarkdownHtml = async (text: string) => text.startsWith('```')
            ? '<pre><code class="language-ts">const files = 2</code></pre>'
            : `<p>${text}</p>`;

        const source = await buildTurnImageExportSource(
            ['Step one: checking the files.', '```ts\nconst files = 2\n```', 'Final answer.'],
            '--md-syntax-string: red',
            renderMarkdownHtml,
        );

        expect(Array.from(source.children, (child) => child.textContent)).toEqual([
            'Step one: checking the files.',
            'tsconst files = 2',
            'Final answer.',
        ]);
        expect(source.querySelector('[data-component="markdown-code"]')?.textContent).toContain('const files = 2');
        const markdownRoots = Array.from(source.querySelectorAll('.markdown-content'), (root) => root.getAttribute('style'));
        expect(markdownRoots).toEqual(['--md-syntax-string: red', '--md-syntax-string: red', '--md-syntax-string: red']);
    });
});
