# Where the docker host is located. Useful when using remote docker hosts.
DOCKER_HOST_IP ?= localhost

# Function to check if a command exists and exit if it does not.
check_dependency = @if command -v "${1}" &> /dev/null ; then true ; else echo "dependency '${1}' is not installed or not available in the PATH" ; exit 1 ; fi

help:								## Show this help.
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

dependencies:							## Check to make sure dependency tools are installed
	# Check to make sure dependent tools are available.
	$(call check_dependency,docker)

devdb:								## Start the dev database in the background.
	# Starting fauna container with setup script.
	@docker compose -p fsk \
		-f ./deployments/dev/db.docker-compose.yml up -d

	# Waiting for setup script to finish running
	@docker attach fsk-faunasetup-1 || docker logs fsk-faunasetup-1

devserver: dependencies devdb					## Start the dev environment server. This will be run in the foreground.
	@docker compose -p fsk \
		-f ./deployments/dev/db.docker-compose.yml \
		-f ./deployments/dev/app.docker-compose.yml \
		up --build

stopdevserver:							## Shut down the dev database and app server. This will keep the data volumes unless make cleandevdb is run.
	# Destroying dev server containers.
	@docker compose -p fsk \
		-f ./deployments/dev/db.docker-compose.yml \
		-f ./deployments/dev/app.docker-compose.yml \
		down

stopdevdb:							## Stops dev database but keeps data
	# Stopping dev database
	@docker compose -p fsk \
		-f ./deployments/dev/db.docker-compose.yml down

cleandevdb: stopdevdb						## Destroy dev database and volumes
	# Destroying data volumes for app
	@docker volume rm fsk_faunadb || true