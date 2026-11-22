Línea de tiempo interactiva — Aprendizaje por refuerzo
Trabajo presentado por Carlos David Garzón Rodríguez
Curso: Introducción a la Ingeniería de Sistemas — UNAD
Reto 4

Qué es
------
Página web interactiva hecha con Three.js. Recorre cuatro hitos del
aprendizaje por refuerzo, de finales de los años ochenta a 2026, con
ocho diagramas animados.

  1. 1980s–1990s  RL clásico
     Bucle agente–entorno (proceso de decisión de Markov) y
     convergencia tabular en un mundo de cuadrícula.
  2. 2013–2017    Deep RL
     Política con red neuronal y comparación del espacio de estados.
  3. 2018–2024    Sim-to-real y control dinámico
     Pipeline de simulación paralela al robot real y currículo de
     estabilidad y rigidez.
  4. 2025–2026    Modelos de comportamiento y multi-agente
     Coordinación Dec-POMDP y pila híbrida de percepción, modelo y
     locomoción.

Las curvas, los porcentajes y el radar son esquemas didácticos.
No son mediciones de un experimento.

Cómo abrirlo
-------------
La forma más simple: hacer doble clic en linea-de-tiempo-rl.html.
Se abre en el navegador y funciona sin internet. Los archivos
linea-de-tiempo-rl.js, three.min.js y las imágenes de referencia
deben permanecer en esta misma carpeta.

También se puede servir la carpeta con Python:

  python -m http.server 8765

y abrir http://127.0.0.1:8765/linea-de-tiempo-rl.html

Cómo usarla
-----------
  Rueda del mouse o flechas     avanzar o retroceder
  Clic en un diagrama           entrar a esa estación
  Botones inferiores            saltar a un hito
  Esc                           volver a la vista general
  P o el botón Presentar        recorrido automático
  Ver figura de referencia      imagen original del diagrama, cuando existe

Archivos
--------
  linea-de-tiempo-rl.html     página
  linea-de-tiempo-rl.js       escena, animaciones y navegación
  three.min.js                biblioteca Three.js r160
  *.jpg                       figuras de referencia de los diagramas
  readme.txt                  este archivo
