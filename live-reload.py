#!/usr/bin/env python
from livereload import Server, shell

server = Server()

# Run Pug to rebuild the code when the file is changed
server.watch('src/*.pug', 'sh build-scripts/build.sh')
server.watch('src/app.ts', 'sh build-scripts/build.sh')
server.watch('src/style.scss', 'sh build-scripts/build.sh')
server.serve(root='site')
