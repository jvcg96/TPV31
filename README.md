Ultimo prompt: 


Te voy a pasar mi saaas tipo TPV, esta especializado pra el nicho de hosteleria, as ique todo fue hecho para que sea muy intuitivo para los camareros que les salga en la pantalla tactil y pueadn trabajar rapido facil y sin problemas, estoy empezando de modo local (sin backend estructurado muy bien) y nuestro modelo de negocio es que cada comercial vende el saas y hace un seguimiento del programa y eso, por lo que es muy dificil que el cliente no pague o haga cosas extrañas, nos fiamos mucho del cliente de momento aunque ya hice cosas con previcion al futuro migrar a un buen backend, pero de momento el sistema de licencia nos funcuiona ya que tenemos el equipo, instalamos la licencia según paga el cliente y lo enviamos el pc tactil + la licencia ya preparada, entonces quiero que me veas todo el codigo y me digas posibles bugs FUNCIONALES, sol oqueiro los funcionales y que sean realmente importantes ya que no busco la perfeccion busco la funcionalidad y sacar el producto a produccion cuanto antes, pero necesito que funcione bien, examina todo el codigo primero antes de decirme cualquier cosa o sugerir codigo, te voy a pasar primero html, luego jss, luego databasejs y luego css y cuando te diga AHORA YA DIME LOS BUGS QUE ENCONTRASTE Y TODO LO DEMAS es que puedes hacerlo, me vas a pasar en un formato de cada bug que encuentres de nivel de importancia, nivel de funcionalidad y una breve explicacion de que puede pasar si no se soluciona el bug, estas preparada? perdon pero primero empezaremos con estos bugs que tengo anotados yo:
🐛 BUG #4: CONFIGURACIÓN DE MESAS SE SOBRESCRIBE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: ALTO
⚙️ Nivel de Funcionalidad Afectada: ALTA
📝 Descripción: En window.onload, se llama a inicializarMesasConfig() ANTES de cargarDatos(). Esto puede sobrescribir la configuración personalizada de mesas del cliente con los valores por defecto, perdiendo nombres personalizados, capacidades y descripciones.

🐛 BUG #5: TECLADOS VIRTUALES MÚLTIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: ALTO
⚙️ Nivel de Funcionalidad Afectada: ALTA
📝 Descripción: Los teclados virtuales pueden abrirse múltiples veces simultáneamente porque no se verifica si ya hay uno abierto. Esto causa que se apilen teclados en pantalla, confundiendo al usuario y haciendo imposible introducir datos correctamente en dispositivos táctiles.

🐛 BUG #6: NO HAY CONTROL DE MÚLTIPLES PESTAÑAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: ALTO
⚙️ Nivel de Funcionalidad Afectada: ALTA
📝 Descripción: El sistema permite abrirse en múltiples pestañas del navegador simultáneamente. Esto causa inconsistencias graves: una mesa puede estar ocupada en una pestaña y libre en otra, el stock puede desincronizarse, y las ventas pueden procesarse múltiples veces.

🐛 BUG #7: IMÁGENES HUÉRFANAS EN LA BASE DE DATOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: MEDIO
⚙️ Nivel de Funcionalidad Afectada: MEDIA
📝 Descripción: Cuando se elimina un producto que tiene imagen, la imagen permanece en IndexedDB ocupando espacio. Con el tiempo, esto puede llenar significativamente el almacenamiento del dispositivo, ralentizando el sistema.

🐛 BUG #8: ESTADOS DEL MODAL DE COBRO NO SE RESETEAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: MEDIO
⚙️ Nivel de Funcionalidad Afectada: ALTA
📝 Descripción: Si se abre el modal de cobro, se cambia el método de pago a tarjeta, y se cierra sin completar, al reabrirlo para otra mesa puede mantener el estado anterior, causando cobros incorrectos o confusión en el cambio.

🐛 BUG #9: FILTROS DE BÚSQUEDA SE PIERDEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: MEDIO
⚙️ Nivel de Funcionalidad Afectada: MEDIA
📝 Descripción: Los filtros aplicados en pedidos e inventario se pierden al cambiar de pestaña. Esto obliga al usuario a reconfigurar los filtros constantemente, reduciendo significativamente la productividad en horas pico.

🐛 BUG #10: FALTA VALIDACIÓN DE CONCURRENCIA EN STOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Nivel de Importancia: MEDIO
⚙️ Nivel de Funcionalidad Afectada: MEDIA
📝 Descripción: No hay verificación de que el stock no haya sido modificado por otro usuario/dispositivo antes de realizar ajustes. En un entorno con múltiples TPVs, esto puede causar sobreventa de productos agotados.
