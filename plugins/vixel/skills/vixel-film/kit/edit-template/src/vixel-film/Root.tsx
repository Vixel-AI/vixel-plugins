import React from 'react';
import {CalculateMetadataFunction, Composition, cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {Edit, FilmProps} from './data';
import {Film} from './Film';

// SIL OFL fonts shipped with the kit (licenses beside them in public/vixel-film/fonts).
const FONTS = [
  {family: 'Sora', url: staticFile('vixel-film/fonts/Sora-Latin-Variable.woff2'), weight: '100 800'},
  {family: 'Fraunces', url: staticFile('vixel-film/fonts/Fraunces-Bold.ttf'), weight: '700'},
];
const fontsReady = delayRender('Loading vixel-film fonts');
Promise.all(FONTS.map((font) => new FontFace(font.family, `url('${font.url}')`, {weight: font.weight}).load()))
  .then((faces) => { faces.forEach((face) => document.fonts.add(face)); continueRender(fontsReady); })
  .catch((error) => cancelRender(error));

async function loadEdit(): Promise<Edit> {
  const response = await fetch(staticFile('cut/edit.json'));
  if (!response.ok) throw new Error('public/cut/edit.json is missing. Run the kit: fetch-cut.mjs, then make-edit.mjs.');
  const edit = (await response.json()) as Edit;
  if (edit.kind !== 'vixel-edit' || edit.version !== 1) throw new Error('public/cut/edit.json was not written by this kit version.');
  return edit;
}

const metadata = (which: 'Film' | 'FilmVixel'): CalculateMetadataFunction<FilmProps> => async ({props}) => {
  const edit = await loadEdit();
  if (which === 'Film' && !edit.cleanExportEntitled) throw new Error('The clean version needs clean export entitlement on this account. Render FilmVixel.');
  return {durationInFrames: edit.totals[which], fps: edit.fps, width: edit.width, height: edit.height, props: {...props, edit}};
};

// FilmVixel = visible watermark (+ brand card); Film = clean version, available only when cleanExportEntitled.
export const VixelFilmRoot: React.FC = () => (
  <>
    <Composition id="FilmVixel" component={Film} defaultProps={{branded: true, edit: null}} calculateMetadata={metadata('FilmVixel')} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Film" component={Film} defaultProps={{branded: false, edit: null}} calculateMetadata={metadata('Film')} durationInFrames={1} fps={30} width={1080} height={1920} />
  </>
);
