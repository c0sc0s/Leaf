import { writePackage } from '../../electron/plugins/package';
import type { PluginManifest } from '@leaf/contracts/plugins';
export const plainManifest: PluginManifest = {
  id: 'test.plain',
  name: 'Plain text',
  version: '1.0.0',
  description: 'Protocol fixture',
  hostApi: '^1.0.0',
  entries: { renderer: 'renderer.js' },
  permissions: ['storage'],
  dependencies: {},
  contributes: {
    documentProviders: ['test.plain.document'],
    views: ['test.plain.view'],
    toolbarActions: ['test.plain.count'],
  },
};
export function plainPackage(options: { fault?: boolean } = {}) {
  const code = `export default { activate(context) {
    const id = 'test.plain.document', locator = metadata => ({documentId:metadata.id,revision:metadata.revision,schema:'test.plain',version:1,payload:{unit:0}});
    context.registerDocumentProvider({id,formats:[{id:'test.plain',label:'Plain text',extensions:['txt'],mimeTypes:['text/plain']}],
      async probe(source) {return source.files.length===1&&source.files[0].name.endsWith('.txt')?100:0},
      async import(source) {return {formatId:'test.plain',title:source.name,author:'',filename:source.name,cover:'',files:[{name:'content.txt',data:source.files[0].data,mime:'text/plain'}],data:{}}},
      async open(record,services) {
        const text=new TextDecoder().decode(await services.readResource('content.txt')), position=locator(record.metadata);
        return {metadata:record.metadata,locators:{validate(value){return value?.documentId===record.metadata.id&&value.revision===record.metadata.revision&&value.schema==='test.plain'},label(){return '全文'}},
          navigation:{count:1,label(){return '全文'},index(){return 0},locator(){return position}},
          content:{async read(){return {blocks:[{kind:'text',id:'body',text,locator:position}]}}},text,dispose(){}};
      }});
    context.registerView({id:'test.plain.view',providerId:id,async mount(view) {
      ${options.fault ? "if (!globalThis.leafRecovered) throw new Error('Plugin view failed');" : ''}
      const body=document.createElement('p');body.dataset.plainContent='';body.textContent=view.document.text;view.container.append(body);
      const position={locator:locator(view.document.metadata),settings:{},viewport:{}};
      view.emit({type:'position',position,progress:{fraction:1,label:'全文'}});view.emit({type:'ready'});
      return {capabilities:{selection:false,annotations:false,settings:[]},capturePosition(){return position},async restorePosition(){},async navigate(){},async turn(){},setSettings(){},setAppearance(){},setAnnotations(){},setSearch(){},clearSelection(){},dispose(){body.remove()}};
    }});
    context.registerToolbarAction({id:'test.plain.count',label:'记录阅读次数',available({session}){return session.document.metadata.formatId==='test.plain'},async run(){
      const count=(await context.host.storage.get('read-count'))||0;await context.host.storage.set('read-count',count+1);context.host.notify('阅读次数 '+(count+1));
    }});
  }};`;
  return plainPackageFrom(code);
}
function plainPackageFrom(code: string) {
  return writePackage(plainManifest, new Map([['renderer.js', new TextEncoder().encode(code)]]));
}
