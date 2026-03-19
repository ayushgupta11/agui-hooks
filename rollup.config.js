import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

const external = ['fast-json-patch', 'react', 'react-dom', 'react/jsx-runtime'];

/** @type {import('rollup').RollupOptions[]} */
export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/esm',
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
    },
    external,
    plugins: [
      peerDepsExternal(),
      resolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        outDir: 'dist/esm',
        exclude: ['src/__tests__/**/*'],
      }),
    ],
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/cjs',
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
      exports: 'named',
    },
    external,
    plugins: [
      peerDepsExternal(),
      resolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        outDir: 'dist/cjs',
        exclude: ['src/__tests__/**/*'],
      }),
    ],
  },
  // Type declarations only
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/types',
      format: 'esm',
    },
    external,
    plugins: [
      peerDepsExternal(),
      typescript({
        tsconfig: './tsconfig.build.json',
        outDir: 'dist/types',
      }),
    ],
  },
];
