import type { RendererPlugin } from '@leaf/plugin-sdk';
import { markdownProvider } from './document/provider';
import { markdownView } from './view/index';

const plugin: RendererPlugin = {
  activate(context) {
    context.registerDocumentProvider(markdownProvider);
    context.registerView(markdownView);
  },
};
export default plugin;
