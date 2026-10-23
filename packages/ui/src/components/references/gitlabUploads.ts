/**
 * Files attached on GitLab. GitLab writes one as a path on its project,
 * `/uploads/<secret>/<name>`, which the browser would resolve against this app
 * and which only a signed-in member may read. For display a picture or a clip
 * goes through the server's GitLab route, and a link to any other file goes to
 * the file on GitLab, where the user is signed in. Code keeps the path as
 * written, and the text attached for the agent is not rewritten at all.
 */
import * as React from 'react';

import type { GitHubReference } from '@/lib/api/types';
import { acquireRuntimeUrlAuthToken, refreshRuntimeUrlAuthToken } from '@/lib/runtime-auth';
import { getRuntimeUrlResolver } from '@/lib/runtime-url';
import type { SourceControlReadContext } from '@/lib/source-control/types';

import { useGitHubReadContext } from './referenceSources';

const UPLOAD_PATH = String.raw`\/uploads\/[0-9a-f]{32}\/[^\s)"'<>]+`;
// An image destination or an HTML `src`: drawn here, so read through the server.
const MEDIA_UPLOAD_RE = new RegExp(String.raw`(!\[[^\]]*\]\(\s*<?|\bsrc=["'])(${UPLOAD_PATH})`, 'g');
// Any other destination or `href`: a file to open on GitLab.
const LINKED_UPLOAD_RE = new RegExp(String.raw`(\]\(\s*<?|\bhref=["'])(${UPLOAD_PATH})`, 'g');
// Fenced blocks and code spans, which show their text as written.
const CODE_RE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2[^\n]*(?=\n|$)|$)|`+[^`\n]*`+/g;

type GitLabUploadUrls = {
    /** Where a drawn picture or clip is read from. */
    media: (path: string) => string;
    /** Where a link to an attached file opens. */
    link: (path: string) => string;
};

/** The same Markdown with every upload path outside code pointed at `urls`. */
export const rewriteGitLabUploads = (markdown: string, urls: GitLabUploadUrls): string => {
    const rewrite = (text: string) => text
        .replace(MEDIA_UPLOAD_RE, (_match, lead: string, path: string) => `${lead}${urls.media(path)}`)
        .replace(LINKED_UPLOAD_RE, (_match, lead: string, path: string) => `${lead}${urls.link(path)}`);
    let result = '';
    let last = 0;
    for (const code of markdown.matchAll(CODE_RE)) {
        result += rewrite(markdown.slice(last, code.index)) + code[0];
        last = code.index + code[0].length;
    }
    return result + rewrite(markdown.slice(last));
};

const uploadUrls = (context: SourceControlReadContext, project: GitHubReference['sourceRepo']): GitLabUploadUrls => ({
    // Signed with the token current at the time, so every item read later
    // gets a fresh one; a clip whose token expired retries (markdownVideo.ts).
    media: (path) => new URL(getRuntimeUrlResolver().authenticatedAsset(`/api/source-control/gitlab${path}`, {
        instance: context.instance,
        directory: context.directory,
        repositoryId: context.repositoryId,
        accountId: context.accountId,
        bindingRevision: context.bindingRevision,
        primaryRemote: context.primaryRemote,
        owner: project.owner,
        repo: project.repo,
    }), window.location.href).toString(),
    link: (path) => new URL(`${project.owner}/${project.repo}${path}`, `${context.instance.replace(/\/+$/, '')}/`).toString(),
});

/**
 * How a GitLab item's description and notes read for display, or null when
 * nothing needs rewriting (GitHub, or the read context is not known yet).
 */
export function useGitLabUploadRewrite(directory: string | null, reference: GitHubReference | null): ((markdown: string) => string) | null {
    const gitlab = reference?.provider === 'gitlab';
    const context = useGitHubReadContext(gitlab ? directory : null);
    // `img` and `video` cannot send headers, so the address carries the URL
    // token. It is kept fresh while a GitLab item is shown; without one the
    // cookie authenticates, so a failed mint still renders.
    const [tokenChecked, setTokenChecked] = React.useState(false);
    React.useEffect(() => {
        if (!gitlab) return undefined;
        let live = true;
        const release = acquireRuntimeUrlAuthToken();
        void refreshRuntimeUrlAuthToken().catch(() => undefined).finally(() => {
            if (live) setTokenChecked(true);
        });
        return () => {
            live = false;
            release();
        };
    }, [gitlab]);
    const project = reference?.sourceRepo;
    return React.useMemo(() => {
        if (!gitlab || !project || !context || context === 'missing' || context.provider !== 'gitlab' || !tokenChecked) return null;
        const urls = uploadUrls(context, project);
        return (markdown: string) => rewriteGitLabUploads(markdown, urls);
    }, [context, gitlab, project, tokenChecked]);
}

/** The rewrite every Markdown body inside a preview applies; none outside one. */
export const ReferenceMarkdownRewriteContext = React.createContext<((markdown: string) => string) | null>(null);
