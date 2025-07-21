import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';
import replace from '@rollup/plugin-replace';
import json from '@rollup/plugin-json';
import polyfillNode from 'rollup-plugin-polyfill-node';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/info-chat-widget.js',
    format: 'iife',
    name: 'InfoChatWidget',
  },
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(process.env.REACT_APP_BACKEND_URL || 'https://random.crl.to'),
      preventAssignment: true
    }),
    postcss({
      extract: false,
      modules: false,
    }),
    json(),
    polyfillNode(),
    nodeResolve({
        extensions: [".js", ".jsx"],
        browser: true
    }),
    commonjs({
        include: /node_modules/,
    }),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**',
      extensions: ['.js', '.jsx']
    }),
    terser(),
  ],
}; 