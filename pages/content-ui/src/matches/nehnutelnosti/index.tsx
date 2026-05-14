import App from './App';
import inlineCss from '../../../dist/nehnutelnosti/index.css?inline';
import { initAppWithShadow } from '@extension/shared';

initAppWithShadow({ id: 'mn-overlay', app: <App />, inlineCss });
