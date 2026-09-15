import { type MediaElement } from './audioEngine'

/**
 * Das eine `<audio>`-Element der App.
 *
 * Es wird genau einmal erzeugt und nie ersetzt. Browser erlauben Wiedergabe
 * nur nach einer Nutzergeste, und diese Erlaubnis hängt am Element – ein neues
 * Element pro Kapitel würde die Wiedergabe beim ersten Kapitelwechsel
 * abbrechen.
 */
let element: HTMLAudioElement | null = null

export function getAudioElement(): MediaElement {
  if (element) return element

  element = document.createElement('audio')
  element.preload = 'metadata'
  // Hörbücher sind lang: Der Browser soll nicht alles im Voraus laden.
  element.setAttribute('playsinline', '')
  element.hidden = true
  document.body.append(element)

  return element
}
