from typing import Type, TypeVar, Generic, Optional, List, Dict, Any
from pydantic import BaseModel
from beanie import Document
from beanie.operators import Set

# Define a TypeVar for Beanie Document models
ModelType = TypeVar("ModelType", bound=Document)
# Define a TypeVar for Pydantic schemas used for updates
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class MongoCRUD(Generic[ModelType]):
    """
    Generic and reusable CRUD operations for Beanie models.
    """

    def __init__(self, model: Type[ModelType]):
        """
        Initialize the CRUD object with a Beanie model.

        :param model: The Beanie Document class.
        """
        self.model = model

    async def create(self, data: BaseModel) -> ModelType:
        """
        Create a new document in the database.

        :param data: A Pydantic model instance with the data to be saved.
        :return: The created document instance.
        """
        document = self.model(**data.model_dump())
        await document.create()
        return document

    async def get(self, document_id: Any) -> Optional[ModelType]:
        """
        Retrieve a single document by its primary key (_id).

        :param document_id: The ID of the document to retrieve.
        :return: The document instance or None if not found.
        """
        return await self.model.get(document_id)

    async def get_by(self, query: Dict[str, Any]) -> Optional[ModelType]:
        """
        Retrieve a single document by a specific query.

        :param query: A dictionary representing the query.
        :return: The document instance or None if not found.
        """
        return await self.model.find_one(query)

    async def get_all(
        self, query: Dict[str, Any] = None, skip: int = 0, limit: int = 100
    ) -> List[ModelType]:
        """
        Retrieve multiple documents matching a query with pagination.

        :param query: A dictionary for filtering documents.
        :param skip: Number of documents to skip.
        :param limit: Maximum number of documents to return.
        :return: A list of document instances.
        """
        if query is None:
            query = {}
        return await self.model.find(query).skip(skip).limit(limit).to_list()

    async def update(
        self, document_id: Any, update_data: UpdateSchemaType
    ) -> Optional[ModelType]:
        """
        Update a document, including nested fields.

        This method uses the `$set` operator to update only the fields
        provided in `update_data`, allowing for partial updates of
        nested Pydantic models.

        :param document_id: The ID of the document to update.
        :param update_data: A Pydantic model instance with the fields to update.
        :return: The updated document instance or None if not found.
        """
        doc = await self.get(document_id)
        if doc:
            # Use model_dump with exclude_unset=True for partial updates
            update_payload = update_data.model_dump(exclude_unset=True)
            await doc.update(Set(update_payload))
            # Return the updated document
            return await self.get(document_id)
        return None

    async def delete(self, document_id: Any) -> bool:
        """
        Delete a document from the database.

        :param document_id: The ID of the document to delete.
        :return: True if deletion was successful, False otherwise.
        """
        doc = await self.get(document_id)
        if doc:
            await doc.delete()
            return True
        return False


# Import all models from the models file
from backend.db import models

# Create CRUD instances for each model
user_crud = MongoCRUD(models.User)
exam_session_crud = MongoCRUD(models.ExamSession)
login_request_crud = MongoCRUD(models.LoginRequest)
examinee_crud = MongoCRUD(models.Examinee)
verifications_crud = MongoCRUD(models.Verifications)
logs_crud = MongoCRUD(models.Logs)
event_log_crud = MongoCRUD(models.EventLog)
exam_crud = MongoCRUD(models.Exam)