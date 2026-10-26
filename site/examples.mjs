/* Inert synthetic form presets. Choosing one is never assent or execution. */
export const examples=Object.freeze({
  report:Object.freeze({title:'Research for my shop',quantity:90,
    task:'Research battery recycling for my shop. Include three sources, a one-page summary and a table comparing the costs.',
    evidence:'Battery recycling can recover valuable materials. This draft includes a short summary, but the three sources and cost comparison table are still missing.'}),
  translation:Object.freeze({title:'Translate my product page',quantity:30,
    task:'Translate my 500-word product page from English to Spanish. Keep the product numbers and headings, provide editable text, and point out any words you are unsure about.',
    evidence:'The page has been translated, but two product numbers and the warranty heading still need to be added.'}),
  dataset:Object.freeze({title:'Check a dataset before I use it',quantity:60,
    task:'Check my supplier spreadsheet. List any missing fields and duplicate rows, show the date range covered, and explain how you checked it.',
    evidence:'The review lists five missing fields and two duplicate rows. It does not include the date range or explain how the checks were done.'})
});

export function example(name){
  if(!Object.hasOwn(examples,name))throw new Error('UNKNOWN_EXAMPLE');
  return {...examples[name]};
}
