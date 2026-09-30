import type { RendererPlugin } from '@leaf/plugin-sdk';
import { pdfProvider } from './document/provider';
import { pdfView } from './view/index';
import './view/pdf.css';

const plugin: RendererPlugin = {
  activate(context) {
    context.registerDocumentProvider(pdfProvider);
    context.registerView(pdfView);
  },
};
export default plugin;
