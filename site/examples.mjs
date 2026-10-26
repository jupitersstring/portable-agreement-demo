/* Inert synthetic form presets. Choosing one is never assent or execution. */
export const examples=Object.freeze({
  report:Object.freeze({title:'Research for my shop',quantity:90,
    task:'Produce a research report on battery recycling. Include three publicly cited sources, a one-page summary, and a table comparing costs. Delivery is a claim; the customer reviews quality separately.',
    evidence:'SYNTHETIC RESEARCH REPORT: Battery recycling can recover valuable materials, but this sample has no verified citations. The promised comparison table is missing.'}),
  translation:Object.freeze({title:'Translate my product page',quantity:30,
    task:'Translate my 500-word product page from English to Spanish. Preserve product numbers and headings, supply editable text, and flag uncertain technical terms. The customer separately reviews accuracy.',
    evidence:'SYNTHETIC TRANSLATION: A draft is supplied, but two product numbers and the warranty heading are missing. No independent language review has occurred.'}),
  dataset:Object.freeze({title:'Check a dataset before I use it',quantity:60,
    task:'Review my sample supplier dataset. Deliver a table of missing fields, duplicate rows and stated date ranges, with a short reproducible method. Record uncertainty; do not claim legal title or external verification.',
    evidence:'SYNTHETIC DATA REVIEW: Five missing fields and two duplicates are claimed. The raw source and method are not attached, so the customer requests the agreed evidence.'})
});

export function example(name){
  if(!Object.hasOwn(examples,name))throw new Error('UNKNOWN_EXAMPLE');
  return {...examples[name]};
}
