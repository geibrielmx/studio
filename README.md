
# Escribe Libro Pro

Escribe Libro Pro es una aplicación web construida con Next.js y React, diseñada para ayudarte a crear, editar y formatear tus libros con facilidad. Permite diseñar portadas, gestionar capítulos, previsualizar el contenido en vivo y exportar tu trabajo a múltiples formatos.

## Características Principales

*   **Editor de Capítulos**: Organiza tu libro en capítulos, cada uno con su propio título y contenido.
*   **Diseñador de Portada**: Personaliza el título, subtítulo, autor, editorial y un texto adicional. Sube una imagen de portada principal y una foto del autor, y elige sus posiciones.
*   **Opciones de Formato**: Ajusta la fuente principal, tamaño de fuente, altura de línea, colores de texto y fondo, relleno de página y alineación del número de página.
*   **Vista Previa en Vivo**: Observa cómo tu libro toma forma con una simulación paginada que incluye encabezados, pies de página y la tabla de contenidos.
*   **Tabla de Contenidos Automática**: Se genera un índice a partir de los títulos de tus capítulos.
*   **Exportación Múltiple**: Exporta tu libro como PDF, TXT o HTML.
*   **Guardado Local**: Guarda tu trabajo como archivos `.txt` en tu computadora y cárgalos para continuar editando. Las preferencias de formato se guardan en el navegador.
*   **Soporte Básico de Markdown**: Utiliza comandos simples de Markdown para dar formato al texto (negritas, itálicas, saltos de página).

## Prerrequisitos

Antes de comenzar, asegúrate de tener instalado lo siguiente:

*   [Node.js](https://nodejs.org/) (Se recomienda la versión LTS)
*   [npm](https://www.npmjs.com/) (viene con Node.js) o [yarn](https://yarnpkg.com/)

## Instalación

1.  Clona este repositorio en tu máquina local (o descarga los archivos si los tienes directamente):
    ```bash
    # Si usas git
    # git clone https://[URL_DEL_REPOSITORIO_SI_EXISTE].git
    # cd nombre-del-directorio-del-proyecto
    ```
2.  Navega al directorio del proyecto:
    ```bash
    cd ruta/a/escribe-libro-pro
    ```
3.  Instala las dependencias del proyecto:
    ```bash
    npm install
    # o si usas yarn
    # yarn install
    ```

## Ejecución en Modo Desarrollo

Para iniciar el servidor de desarrollo y ver la aplicación en tu navegador:

```bash
npm run dev
# o si usas yarn
# yarn dev
```

Esto generalmente iniciará la aplicación en `http://localhost:9002` (o el puerto configurado en `package.json`).

## Scripts Disponibles

En el archivo `package.json`, encontrarás varios scripts útiles:

*   `npm run dev`: Inicia la aplicación en modo desarrollo con Turbopack.
*   `npm run build`: Compila la aplicación para producción.
*   `npm run start`: Inicia un servidor de producción después de compilar.
*   `npm run lint`: Ejecuta ESLint para analizar el código.
*   `npm run typecheck`: Ejecuta el compilador de TypeScript para verificar tipos.

## Construcción para Producción

Para crear una versión optimizada de la aplicación para producción:

```bash
npm run build
# o si usas yarn
# yarn build
```

Esto generará los archivos estáticos en la carpeta `.next/`. Luego puedes usar `npm run start` para servir esta versión de producción.

---

¡Gracias por usar Escribe Libro Pro!
# CreaLibro
