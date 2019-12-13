#!/usr/bin/env python
from livereload import Server, shell

server = Server()

# Run Pug to rebuild the code when the file is changed
server.watch('src/index.pug', 'npx pug src --out site')
server.watch('src/app.js', 'cp src/app.js site/app.js')
server.watch('src/style.scss', 'npx sass src/style.scss site/style.css')
server.serve(root='site')
